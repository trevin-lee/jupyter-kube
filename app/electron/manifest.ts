import type * as k8sTypes from '@kubernetes/client-node'
import * as path from 'path'
import { logger } from './logging-service'
import { AppConfig } from '../src/types/app'
import { getK8s } from './k8s-client'
import {
  DEFAULT_GPU_RESOURCE_KEY,
  DEFAULT_NAMESPACE,
  LABELS,
  LABEL_VALUES,
  condaConfigMapName,
  instanceLabels,
  sshSecretName
} from './constants'

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

    const secretName = sshSecretName(baseName)

    // Extract the key filename from the path (e.g., id_rsa, id_ed25519, etc.)
    const keyFileName = git.sshKeyPath ? path.basename(git.sshKeyPath) : 'id_rsa'

    const secret: k8sTypes.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: kubernetes.namespace || DEFAULT_NAMESPACE,
        labels: {
          ...instanceLabels(baseName),
          [LABELS.type]: LABEL_VALUES.sshKey
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
    sshSecretRef: string | null,
    manifests: k8sTypes.KubernetesObject[]
  ): void {
    const { hardware, container, git, kubernetes, environment } = config

    const podLabels = instanceLabels(baseName)

    const statefulSet: k8sTypes.V1StatefulSet = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: baseName,
        namespace: kubernetes.namespace || DEFAULT_NAMESPACE,
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
                  image: container.image,
                  imagePullPolicy: 'Always',
                  ports: [{ containerPort: 8888 }],
                  env: [],
                  // No `command` override: we run whatever the image's own CMD is.
                  // Overriding the entrypoint would break any image that doesn't
                  // happen to use the same startup script layout.
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

    if (hardware.gpuCount > 0) {
      if (!podSpec.containers[0].resources) podSpec.containers[0].resources = {};
      if (!podSpec.containers[0].resources.limits) podSpec.containers[0].resources.limits = {};
      const gpuResourceKey = hardware.gpuResourceKey?.trim() || DEFAULT_GPU_RESOURCE_KEY
      podSpec.containers[0].resources!.limits![gpuResourceKey] = String(
        hardware.gpuCount
      )

      // Node targeting is optional. Without it the scheduler picks any node that
      // can satisfy the GPU resource request, which works on most clusters. A
      // label key/value is only needed to pin a specific GPU model, and the key
      // is cluster-specific (nvidia.com/gpu.product, cloud.google.com/gke-accelerator, ...).
      const labelKey = hardware.gpuNodeLabelKey?.trim()
      const labelValue = hardware.gpuNodeLabelValue?.trim()
      if (labelKey && labelValue) {
        if (!podSpec.nodeSelector) podSpec.nodeSelector = {};
        podSpec.nodeSelector[labelKey] = labelValue
      }
    }

    if (sshSecretRef) {
      if (!podSpec.volumes) podSpec.volumes = [];
      podSpec.volumes!.push({
        name: 'ssh-key-volume',
        secret: {
          secretName: sshSecretRef,
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
      const configMapName = condaConfigMapName(baseName, env.name)
      const fileName = env.fileName
        ? path.basename(env.fileName)
        : `${env.name}.yml`

      const configMap: k8sTypes.V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: configMapName,
          namespace: kubernetes.namespace || DEFAULT_NAMESPACE,
          labels: {
            ...instanceLabels(baseName),
            [LABELS.type]: LABEL_VALUES.condaEnvironment
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