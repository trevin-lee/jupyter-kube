import type * as k8sTypes from '@kubernetes/client-node'
import * as path from 'path'
import { logger } from './logging-service'
import { AppConfig } from '../src/types/app'

// These types should ideally be shared from `app/src/types/app.ts`
// Re-declaring them here to avoid complex build configurations for now.
export interface PvcConfig {
  name: string
  mountPath?: string
}
export interface HardwareConfig {
  cpu: string
  memory: string
  gpu: string
  gpuCount: number
  pvcs: PvcConfig[]
}
export interface KubernetesConfig {
  kubeConfigPath: string
  namespace?: string
}
export interface CondaEnvironment {
  id: string
  name: string
  content: string
  fileName?: string
}
export interface EnvironmentConfig {
  condaEnvironments: CondaEnvironment[]
}
export interface GitConfig {
  username: string
  email: string
  sshKeyPath: string
  sshKeyContent?: string
}

type K8sModule = typeof import('@kubernetes/client-node')
let k8sPromise: Promise<K8sModule> | null = null
const getK8s = () => {
  if (!k8sPromise) {
    // Use Function constructor to prevent TypeScript from transpiling this
    const dynamicImport = new Function('specifier', 'return import(specifier)')
    k8sPromise = dynamicImport('@kubernetes/client-node') as Promise<K8sModule>
  }
  return k8sPromise
}

export class ManifestManager {
  private static instance: ManifestManager

  private constructor() {}

  public static getInstance(): ManifestManager {
    if (!ManifestManager.instance) {
      ManifestManager.instance = new ManifestManager()
    }
    return ManifestManager.instance
  }

  /**
   * Normalize resource quantities to valid Kubernetes format
   * e.g., "3Gb" -> "3G", "2gb" -> "2G", "512mb" -> "512M"
   */
  private normalizeResourceQuantity(quantity: string): string {
    if (!quantity) return quantity
    
    // Replace common incorrect suffixes with correct ones
    return quantity
      .replace(/gb$/i, 'G')
      .replace(/mb$/i, 'M')
      .replace(/kb$/i, 'K')
      .replace(/tb$/i, 'T')
  }

  public async buildManifests(config: AppConfig, baseNameOverride?: string): Promise<k8sTypes.KubernetesObject[]> {
    const k8s = await getK8s()
    const manifests: k8sTypes.KubernetesObject[] = []
    const baseName = baseNameOverride ?? `jupyter-lab-${Date.now()}`

    const secretName = this.buildSshSecret(config, baseName, manifests)
    this.buildStatefulSet(config, baseName, secretName, manifests)

    logger.info(
      `[ManifestManager] Built ${manifests.length} manifests for deployment.`
    )
    return manifests
  }

  private buildSshSecret(
    config: AppConfig,
    baseName: string,
    manifests: k8sTypes.KubernetesObject[]
  ): string | null {
    const { git, kubernetes } = config
    
    // Debug logging
    logger.info('[ManifestManager] buildSshSecret called with git config:', {
      hasUsername: !!git.username,
      hasEmail: !!git.email,
      sshKeyPath: git.sshKeyPath,
      hasSshKeyContent: !!git.sshKeyContent,
      sshKeyContentLength: git.sshKeyContent?.length || 0
    })
    
    if (!git.sshKeyContent) {
      logger.info(
        '[ManifestManager] No SSH key content found, skipping secret creation.'
      )
      return null
    }

    const secretName = `${baseName}-ssh-secret`
    
    // Extract the key filename from the path (e.g., id_rsa, id_ed25519, etc.)
    const keyFileName = git.sshKeyPath ? path.basename(git.sshKeyPath) : 'id_rsa'

    const secret: k8sTypes.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: kubernetes.namespace || 'default'
      },
      type: 'Opaque',
      data: {
        [keyFileName]: Buffer.from(git.sshKeyContent).toString('base64')
      }
    }

    // Debug: Log info about the SSH key being stored
    const keyPreview = git.sshKeyContent.substring(0, 50).replace(/\n/g, '\\n')
    logger.info(`[ManifestManager] Storing SSH key in secret, key starts with: ${keyPreview}...`)
    logger.info(`[ManifestManager] SSH key length: ${git.sshKeyContent.length} characters`)

    manifests.push(secret)
    logger.info(`[ManifestManager] Built SSH key secret: ${secretName} with key file: ${keyFileName}`)
    return secretName
  }

  private buildStatefulSet(
    config: AppConfig,
    baseName: string,
    sshSecretName: string | null,
    manifests: k8sTypes.KubernetesObject[]
  ): void {
    const { hardware, git, kubernetes, environment } = config

    const podLabels = {
      app: 'jupyter-lab',
      'managed-by': 'jupyter-kube-app',
      instance: baseName
    }

    const statefulSet: k8sTypes.V1StatefulSet = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: baseName,
        namespace: kubernetes.namespace || 'default'
      },
      spec: {
        replicas: 1,
        serviceName: `${baseName}-svc`,
        selector: {
          matchLabels: podLabels
        },
        template: {
          metadata: {
            labels: podLabels
          },
                      spec: {
              containers: [
                {
                  name: 'jupyter-container',
                  image:
                    'gitlab-registry.nrp-nautilus.io/trevin/jupyter-kube/jupyter:latest',
                  imagePullPolicy: 'Always',
                  ports: [{ containerPort: 8888 }],
                  env: [],
                  command: ['/bin/bash', '-c'],
                args: [`
                  # Create .ssh directory if it doesn't exist
                  mkdir -p /home/jovyan/.ssh
                  chmod 700 /home/jovyan/.ssh
                  
                  # Copy SSH keys from mounted volume
                  if [ -d /tmp/ssh-keys ]; then
                    echo "Copying SSH keys from /tmp/ssh-keys..."
                    for file in /tmp/ssh-keys/*; do
                      if [ -f "$file" ]; then
                        filename=$(basename "$file")
                        echo "Copying $filename to /home/jovyan/.ssh/"
                        cp -f "$file" "/home/jovyan/.ssh/$filename"
                        chmod 600 "/home/jovyan/.ssh/$filename"
                      fi
                    done
                    
                    # List copied keys for verification
                    echo "SSH keys in ~/.ssh:"
                    ls -la /home/jovyan/.ssh/
                  else
                    echo "WARNING: /tmp/ssh-keys directory not found!"
                  fi
                  
                  # Set up SSH configuration
                  if [ -d /tmp/ssh-config ]; then
                    cp -f /tmp/ssh-config/config /home/jovyan/.ssh/config 2>/dev/null || true
                    cp -f /tmp/ssh-config/known_hosts /home/jovyan/.ssh/known_hosts 2>/dev/null || true
                    chmod 600 /home/jovyan/.ssh/config 2>/dev/null || true
                    chmod 644 /home/jovyan/.ssh/known_hosts 2>/dev/null || true
                  fi
                  
                  # Debug: Test SSH agent
                  echo "Testing SSH agent..."
                  ssh-add -l 2>/dev/null || echo "No SSH agent running or no keys loaded"
                  
                  # Start SSH agent and add keys
                  eval $(ssh-agent -s)
                  for key in /home/jovyan/.ssh/*; do
                    if [ -f "$key" ] && [[ ! "$key" =~ \\.pub$ ]] && [[ ! "$key" =~ known_hosts ]] && [[ ! "$key" =~ config ]]; then
                      ssh-add "$key" 2>/dev/null && echo "Added SSH key: $key" || echo "Failed to add SSH key: $key"
                    fi
                  done
                  
                  # Use the custom start script that handles environments
                  exec /home/jovyan/start-jupyter.sh
                `],
                resources: {
                  requests: {
                    cpu: this.normalizeResourceQuantity(hardware.cpu),
                    memory: this.normalizeResourceQuantity(hardware.memory)
                  },
                  limits: {
                    cpu: this.normalizeResourceQuantity(hardware.cpu),
                    memory: this.normalizeResourceQuantity(hardware.memory)
                  }
                },
                volumeMounts: []
              }
            ],
            volumes: []
            // restartPolicy is not needed; StatefulSet controller manages it.
          }
        }
      }
    }

    // All modifications now apply to the pod template's spec
    if (!statefulSet.spec?.template?.spec) {
      logger.error('[ManifestManager] StatefulSet spec or template spec is undefined.');
      return;
    }
    const podSpec = statefulSet.spec.template.spec

    if (git.username) {
      podSpec.containers[0].env!.push({
        name: 'GIT_USER_NAME',
        value: git.username
      })
    }
    if (git.email) {
      podSpec.containers[0].env!.push({
        name: 'GIT_USER_EMAIL',
        value: git.email
      })
    }

    if (hardware.gpu !== 'none' && hardware.gpuCount > 0) {
      if (!podSpec.containers[0].resources) podSpec.containers[0].resources = {};
      if (!podSpec.containers[0].resources.limits) podSpec.containers[0].resources.limits = {};
      podSpec.containers[0].resources!.limits!['nvidia.com/gpu'] = String(
        hardware.gpuCount
      )
      if (hardware.gpu !== 'any-gpu') {
        if (!podSpec.nodeSelector) podSpec.nodeSelector = {};
        podSpec.nodeSelector['gpu-type'] = hardware.gpu
      }
    }

    if (sshSecretName) {
      if (!podSpec.volumes) podSpec.volumes = [];
      podSpec.volumes!.push({
        name: 'ssh-key-volume',
        secret: {
          secretName: sshSecretName,
          defaultMode: 0o444  // Make readable by all users in the container
        }
      })
      if (!podSpec.containers[0].volumeMounts) podSpec.containers[0].volumeMounts = [];
      podSpec.containers[0].volumeMounts!.push({
        name: 'ssh-key-volume',
        mountPath: '/tmp/ssh-keys',
        readOnly: true
      })
      
      // Add SSH config to disable strict host key checking for seamless Git operations
      // This creates a ConfigMap with SSH config that trusts common Git hosts
      const sshConfigName = `${baseName}-ssh-config`
      const sshConfig: k8sTypes.V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: sshConfigName,
          namespace: kubernetes.namespace || 'default'
        },
        data: {
          'config': `# Auto-generated SSH config for seamless Git operations
Host gitlab.com
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
    
Host github.com
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
    
Host bitbucket.org
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null

# Accept any Git host without manual verification    
Host *
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
`,
          'known_hosts': `# Common Git hosts - auto-populated for convenience
gitlab.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf
gitlab.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCsj2bNKTBSpIYDEGk9KxsGh3mySTRgMtXL583qmBpzeQ+jqCMRgBqB98u3z++J1sKlXHWfM9dyhSevkMwSbhoR8XIq/U0tCNyokEi/ueaBMCvbcTHhO7FcwzY92WK4Yt0aGROY5qX83DpC7okTxC3JAESaNRbdSSwoGh+8ZERSjNbi0gMbaY6k1gKNxncG0AFDxpEEo8yTubR+Xr11LrR83QcZ5gBd00HgMSkfNoZONOc1nBdOBuZgTYkMZwR3i5zfQxxd3l1ao0gv4SHuzm0L5QHdg0Feqw8T5HqphiWKzrmMp+SdpQM+O2iIpPHIXuBIhwPH+ogqAmMhJRWdRlLw
gitlab.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBFSMqzJeV9rUzU4kWitGjeR4PWSa29SPqJ1fVkhtj3Hw9xjLVXVYrU9QlYWrOLXBpQ6KWjbjTDTdDkoohFzgbEY=
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
`
        }
      }
      manifests.push(sshConfig)
      
      // Add the SSH config volume
      podSpec.volumes!.push({
        name: 'ssh-config-volume',
        configMap: {
          name: sshConfigName,
          defaultMode: 0o644
        }
      })
      
      // Mount the SSH config to a temporary location
      // We'll copy it to the right place on container startup
      podSpec.containers[0].volumeMounts!.push({
        name: 'ssh-config-volume',
        mountPath: '/tmp/ssh-config',
        readOnly: true
      })
    }

    // Process conda environments
    logger.info(`[ManifestManager] Processing ${environment.condaEnvironments.length} conda environments`)
    for (const env of environment.condaEnvironments) {
      logger.info(`[ManifestManager] Adding conda environment: ${env.name}`)
      const configMapName = `${baseName}-conda-${env.name}`.toLowerCase()
      const fileName = env.fileName
        ? path.basename(env.fileName)
        : `${env.name}.yml`

      const configMap: k8sTypes.V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: configMapName,
          namespace: kubernetes.namespace || 'default'
        },
        data: {
          [fileName]: env.content
        }
      }
      manifests.push(configMap)
      logger.info(`[ManifestManager] Created ConfigMap ${configMapName} for environment ${env.name}`)

      const volumeName = `conda-env-${env.name}`.toLowerCase()
      if (!podSpec.volumes) podSpec.volumes = [];
      podSpec.volumes!.push({
        name: volumeName,
        configMap: {
          name: configMapName
        }
      })
      if (!podSpec.containers[0].volumeMounts) podSpec.containers[0].volumeMounts = [];
      podSpec.containers[0].volumeMounts!.push({
        name: volumeName,
        mountPath: `/home/jovyan/environments/${fileName}`,
        subPath: fileName
      })
      logger.info(`[ManifestManager] Mounted environment ${env.name} at /home/jovyan/environments/${fileName}`)
    }

    for (const pvc of hardware.pvcs) {
      if (pvc.name) {
        const volumeName = `pvc-volume-${pvc.name}`.toLowerCase()
        if (!podSpec.volumes) podSpec.volumes = [];
        podSpec.volumes!.push({
          name: volumeName,
          persistentVolumeClaim: {
            claimName: pvc.name
          }
        })
        if (!podSpec.containers[0].volumeMounts) podSpec.containers[0].volumeMounts = [];
        podSpec.containers[0].volumeMounts!.push({
          name: volumeName,
          mountPath: `/home/jovyan/main/${pvc.name}`
        })
      }
    }

    manifests.push(statefulSet)
    logger.info(`[ManifestManager] Built StatefulSet manifest: ${baseName}`)
  }
}