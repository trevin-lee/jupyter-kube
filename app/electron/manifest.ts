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
        namespace: kubernetes.namespace || 'default',
        labels: {
          'app': 'jupyter-lab',
          'managed-by': 'jupyter-kube-app',
          'instance': baseName,
          'type': 'ssh-key'
        }
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
        namespace: kubernetes.namespace || 'default',
        labels: podLabels
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
                  command: ['/home/jovyan/start-jupyter.sh'],
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
          namespace: kubernetes.namespace || 'default',
          labels: {
            'app': 'jupyter-lab',
            'managed-by': 'jupyter-kube-app',
            'instance': baseName,
            'type': 'conda-environment'
          }
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
        mountPath: `/home/jovyan/main/environments/${fileName}`,
        subPath: fileName
      })
      logger.info(`[ManifestManager] Mounted environment ${env.name} at /home/jovyan/main/environments/${fileName}`)
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