import { AppConfig } from '../types/app'

export interface KubernetesDeploymentManifest {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    labels: Record<string, string>
  }
  spec: {
    replicas: number
    selector: {
      matchLabels: Record<string, string>
    }
    template: {
      metadata: {
        labels: Record<string, string>
      }
      spec: {
        containers: Array<{
          name: string
          image: string
          resources: {
            requests: Record<string, string>
            limits: Record<string, string>
          }
          ports?: Array<{
            containerPort: number
            name: string
            protocol: string
          }>
          env?: Array<{
            name: string
            value: string
          }>
          volumeMounts?: Array<{
            name: string
            mountPath: string
            readOnly?: boolean
          }>
        }>
        volumes?: Array<{
          name: string
          persistentVolumeClaim?: {
            claimName: string
          }
          secret?: {
            secretName: string
            defaultMode?: number
          }
        }>
        nodeSelector?: Record<string, string>
      }
    }
  }
}

/**
 * Generates a Kubernetes Deployment manifest from AppConfig
 */
export function generateDeploymentManifest(
  config: AppConfig,
  deploymentName: string = 'jupyterlab-deployment'
): KubernetesDeploymentManifest {
  
  const labels = {
    app: 'jupyterlab',
    'app.kubernetes.io/name': 'jupyterlab',
    'app.kubernetes.io/created-by': 'jupyter-kube-launcher'
  }
  
  const JUPYTERLAB_IMAGE = 'gitlab-registry.nrp-nautilus.io/trevin/jupyter-kube/jupyter:latest' 

  const manifest: KubernetesDeploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: deploymentName,
      labels
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels
      },
      template: {
        metadata: {
          labels
        },
        spec: {
          containers: [
            {
              name: 'jupyterlab',
              image: JUPYTERLAB_IMAGE,
              resources: {
                requests: {},
                limits: {}
              },
              ports: [
                {
                  containerPort: 8888,
                  name: 'jupyter',
                  protocol: 'TCP'
                }
              ],
              env: [
                {
                  name: 'JUPYTER_ENABLE_LAB',
                  value: 'yes'
                },
                {
                  name: 'JUPYTER_TOKEN',
                  value: ''
                }
              ]
            }
          ]
        }
      }
    }
  }

  // Set CPU resources
  if (config.hardware.cpu) {
    manifest.spec.template.spec.containers[0].resources.requests['cpu'] = config.hardware.cpu
    manifest.spec.template.spec.containers[0].resources.limits['cpu'] = config.hardware.cpu
  }

  // Set Memory resources
  if (config.hardware.memory) {
    manifest.spec.template.spec.containers[0].resources.requests['memory'] = config.hardware.memory
    manifest.spec.template.spec.containers[0].resources.limits['memory'] = config.hardware.memory
  }

  // Handle GPU configuration
  if (config.hardware.gpu !== 'none' && config.hardware.gpuCount > 0) {
    const gpuResourceKey = getGpuResourceKey(config.hardware.gpu)
    if (gpuResourceKey) {
      manifest.spec.template.spec.containers[0].resources.requests[gpuResourceKey] = config.hardware.gpuCount.toString()
      manifest.spec.template.spec.containers[0].resources.limits[gpuResourceKey] = config.hardware.gpuCount.toString()
      
      // Add GPU-specific node selector if needed
      if (config.hardware.gpu !== 'none' && config.hardware.gpu !== 'amd' && config.hardware.gpu !== 'intel') {
        // For NVIDIA GPUs, add accelerator node selector
        manifest.spec.template.spec.nodeSelector = {
          'accelerator': 'nvidia'
        }
      }
    }
  }

  // Handle PVC mounting
  if (config.hardware.pvcs && config.hardware.pvcs.length > 0) {
    if (!manifest.spec.template.spec.volumes) {
      manifest.spec.template.spec.volumes = []
    }
    if (!manifest.spec.template.spec.containers[0].volumeMounts) {
      manifest.spec.template.spec.containers[0].volumeMounts = []
    }

    config.hardware.pvcs.forEach((pvc, index) => {
      if (pvc.name && pvc.mountPath) {
        const volumeName = `data-volume-${index}`
        
        manifest.spec.template.spec.volumes!.push({
          name: volumeName,
          persistentVolumeClaim: {
            claimName: pvc.name
          }
        })

        manifest.spec.template.spec.containers[0].volumeMounts!.push({
          name: volumeName,
          mountPath: pvc.mountPath
        })
      }
    })
  }

  // Add Git configuration as environment variables if provided
  if (config.git.username) {
    manifest.spec.template.spec.containers[0].env?.push({
      name: 'GIT_AUTHOR_NAME',
      value: config.git.username
    })
    manifest.spec.template.spec.containers[0].env?.push({
      name: 'GIT_COMMITTER_NAME',
      value: config.git.username
    })
  }

  if (config.git.email) {
    manifest.spec.template.spec.containers[0].env?.push({
      name: 'GIT_AUTHOR_EMAIL',
      value: config.git.email
    })
    manifest.spec.template.spec.containers[0].env?.push({
      name: 'GIT_COMMITTER_EMAIL',
      value: config.git.email
    })
  }

  // Mount secrets as volumes if they should be deployed
  if (config.git.enableSSHKeyDeployment && config.git.sshKeyContent) {
    if (!manifest.spec.template.spec.volumes) {
      manifest.spec.template.spec.volumes = []
    }
    if (!manifest.spec.template.spec.containers[0].volumeMounts) {
      manifest.spec.template.spec.containers[0].volumeMounts = []
    }

    // Add SSH key secret volume
    manifest.spec.template.spec.volumes.push({
      name: 'ssh-key-volume',
      secret: {
        secretName: config.deployment?.sshKeySecretName || 'jupyter-ssh-key',
        defaultMode: 0o600
      }
    })

    // Mount SSH key secret
    manifest.spec.template.spec.containers[0].volumeMounts.push({
      name: 'ssh-key-volume',
      mountPath: '/home/jovyan/.ssh',
      readOnly: true
    })
  }

  return manifest
}

/**
 * Converts the manifest object to YAML-like JSON string
 */
export function manifestToYaml(manifest: KubernetesDeploymentManifest): string {
  return JSON.stringify(manifest, null, 2)
}

/**
 * Gets the appropriate GPU resource key based on GPU type
 */
function getGpuResourceKey(gpuType: string): string | null {
  switch (gpuType.toLowerCase()) {
    case 'any-gpu':
      return 'nvidia.com/gpu'
    case 'a40':
      return 'nvidia.com/a40'
    case 'a100':
      return 'nvidia.com/a100'
    case 'rtxa6000':
      return 'nvidia.com/rtxa6000'
    case 'rtx8000':
      return 'nvidia.com/rtx8000'
    case 'gh200':
      return 'nvidia.com/gh200'
    case 'mig-small':
      return 'nvidia.com/mig-small'
    case 'amd':
      return 'amd.com/gpu'
    case 'intel':
      return 'gpu.intel.com/i915'
    default:
      return null
  }
}

/**
 * Validates if an AppConfig is sufficient for manifest generation
 */
export function validateConfig(config: AppConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.hardware.cpu) {
    errors.push('CPU configuration is required')
  }

  if (!config.hardware.memory) {
    errors.push('Memory configuration is required')
  }

  if (config.hardware.gpu !== 'none' && config.hardware.gpuCount <= 0) {
    errors.push('GPU count must be greater than 0 when GPU is selected')
  }

  // Validate PVC configurations
  config.hardware.pvcs.forEach((pvc, index) => {
    if (pvc.name && !pvc.mountPath) {
      errors.push(`PVC ${index + 1}: Mount path is required when PVC name is specified`)
    }
    if (!pvc.name && pvc.mountPath) {
      errors.push(`PVC ${index + 1}: PVC name is required when mount path is specified`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
} 