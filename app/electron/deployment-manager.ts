import { promises as fs } from 'fs'
import crypto from 'crypto'
import { logger } from './logging-service'
import { ManifestManager } from './manifest'
import { PortForwardManager } from './portforward-manager'
import type { AppConfig } from '../src/types/app'

// We load k8s at runtime
import type { KubeConfig, CoreV1Api, AppsV1Api } from '@kubernetes/client-node'

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

export interface DeploymentStatus {
  exists: boolean
  podName?: string
  statefulSetName?: string
  ready?: boolean
  phase?: string
  message?: string
}

export class DeploymentManager {
  private static instance: DeploymentManager
  private manifestManager = ManifestManager.getInstance()
  private portForwardManager: PortForwardManager | null = null

  private constructor() {}

  public static getInstance(): DeploymentManager {
    if (!DeploymentManager.instance) DeploymentManager.instance = new DeploymentManager()
    return DeploymentManager.instance
  }

  /**
   * Hash kubeconfig contents to produce stable unique ID.
   */
  public async computeDeploymentName(kubeConfigPath: string): Promise<string> {
    logger.info(`[DeploymentManager] Computing deployment name for kubeconfig: ${kubeConfigPath}`)
    if (!kubeConfigPath) {
      throw new Error('kubeConfigPath is undefined or empty')
    }
    const contents = await fs.readFile(kubeConfigPath, 'utf8')
    const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12)
    return `jupyter-${hash}`
  }

  /**
   * Check if a StatefulSet with the given name exists
   */
  public async checkExistingDeployment(
    deploymentName: string, 
    namespace: string, 
    kc: KubeConfig
  ): Promise<DeploymentStatus> {
    const k8s = await getK8s()
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    try {
      // Check if StatefulSet exists
      const statefulSet = await appsApi.readNamespacedStatefulSet({ 
        name: deploymentName, 
        namespace 
      })
      
      logger.info(`[DeploymentManager] Found existing StatefulSet: ${deploymentName}`)
      
      // Check if the pod exists and is ready
      const podName = `${deploymentName}-0`
      try {
        const pod = await coreApi.readNamespacedPod({ 
          name: podName, 
          namespace 
        })
        
        const isReady = pod.status?.containerStatuses?.every((c: any) => c.ready) || false
        const phase = pod.status?.phase || 'Unknown'
        
        return {
          exists: true,
          statefulSetName: deploymentName,
          podName: podName,
          ready: isReady,
          phase: phase,
          message: `Found existing deployment ${deploymentName}`
        }
      } catch (podError: any) {
        if (podError.statusCode === 404 || podError.body?.code === 404 || podError.code === 404) {
          return {
            exists: true,
            statefulSetName: deploymentName,
            ready: false,
            message: `StatefulSet exists but pod not found`
          }
        }
        throw podError
      }
    } catch (error: any) {
      if (error.statusCode === 404 || error.body?.code === 404 || error.code === 404) {
        logger.info(`[DeploymentManager] No existing StatefulSet found: ${deploymentName}`)
        return {
          exists: false,
          message: `No existing deployment found`
        }
      }
      throw error
    }
  }

  /**
   * Ensure pod exists; create if missing. Returns deployment info.
   */
  public async ensureDeployment(
    config: AppConfig, 
    kc: KubeConfig
  ): Promise<{ 
    podName: string; 
    created: boolean; 
    existingDeployment?: boolean 
  }> {
    logger.info('[DeploymentManager] ensureDeployment called with config:', JSON.stringify({
      kubernetes: config?.kubernetes,
      hasGit: !!config?.git,
      hasHardware: !!config?.hardware,
      hasEnvironment: !!config?.environment
    }))
    
    const k8s = await getK8s()
    const deploymentName = await this.computeDeploymentName(config.kubernetes.kubeConfigPath)
    const namespace = config.kubernetes.namespace || 'default'

    // Check for existing deployment
    const status = await this.checkExistingDeployment(deploymentName, namespace, kc)
    
    if (status.exists && status.ready) {
      logger.info(`[DeploymentManager] Using existing ready deployment: ${deploymentName}`)
      return { 
        podName: status.podName!, 
        created: false, 
        existingDeployment: true 
      }
    }

    if (status.exists && !status.ready) {
      logger.info(`[DeploymentManager] Existing deployment found but not ready, waiting...`)
      return { 
        podName: `${deploymentName}-0`, 
        created: false, 
        existingDeployment: true 
      }
    }

    // Need to create new deployment
    logger.info('[DeploymentManager] Creating new deployment...')
    const manifests = await this.manifestManager.buildManifests(config, deploymentName)
    const objectClient = k8s.KubernetesObjectApi.makeApiClient(kc)
    
    for (const manifest of manifests) {
      try {
        // Create the resource
        await objectClient.create(manifest)
        logger.info(`[DeploymentManager] Created ${manifest.kind}: ${manifest.metadata?.name}`)
      } catch (error: any) {
        // If resource already exists, log and continue
        if (error.statusCode === 409 || error.body?.code === 409 || error.code === 409) {
          logger.info(`[DeploymentManager] ${manifest.kind} ${manifest.metadata?.name} already exists, continuing...`)
          continue
        }
        logger.error(`[DeploymentManager] Failed to create ${manifest.kind}: ${manifest.metadata?.name}`, error)
        throw error
      }
    }
    
    logger.info('[DeploymentManager] Submitted manifests to cluster.')
    return { 
      podName: `${deploymentName}-0`, 
      created: true, 
      existingDeployment: false 
    }
  }

  /**
   * Poll pod status until ready or timeout
   */
  public async pollPodStatus(
    podName: string,
    namespace: string,
    kc: KubeConfig,
    onStatusUpdate?: (status: DeploymentStatus) => void,
    timeoutMs: number = 300000 // 5 minutes default
  ): Promise<DeploymentStatus> {
    const k8s = await getK8s()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const startTime = Date.now()
    const pollInterval = 2000 // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const pod = await coreApi.readNamespacedPod({ name: podName, namespace })
        const podStatus = pod.status
        const isReady = podStatus?.containerStatuses?.every((c: any) => c.ready) || false
        const phase = podStatus?.phase || 'Unknown'
        
        const status: DeploymentStatus = {
          exists: true,
          podName: podName,
          ready: isReady,
          phase: phase,
          message: `Pod ${phase}, Ready: ${isReady}`
        }

        if (onStatusUpdate) {
          onStatusUpdate(status)
        }

        if (isReady) {
          logger.info(`[DeploymentManager] Pod ${podName} is ready`)
          return status
        }

        // Check for failure conditions
        if (phase === 'Failed' || phase === 'Unknown') {
          throw new Error(`Pod ${podName} is in ${phase} state`)
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error: any) {
        if (error.statusCode === 404) {
          logger.warn(`[DeploymentManager] Pod ${podName} not found yet, waiting...`)
          await new Promise(resolve => setTimeout(resolve, pollInterval))
          continue
        }
        throw error
      }
    }

    throw new Error(`Timeout waiting for pod ${podName} to be ready`)
  }

  /**
   * Setup port forwarding for existing deployment
   */
  public async setupPortForwardForExisting(
    namespace: string,
    podName: string,
    kc: KubeConfig,
    containerPort: number = 8888,
    localPort: number = 8888
  ): Promise<void> {
    if (!this.portForwardManager) {
      this.portForwardManager = new PortForwardManager(kc)
    }
    
    logger.info(`[DeploymentManager] Setting up port forward for existing pod ${podName}`)
    await this.portForwardManager.forward(namespace, podName, containerPort, localPort)
  }

  /**
   * Stop port forwarding if active
   */
  public stopPortForward(): void {
    if (this.portForwardManager) {
      this.portForwardManager.stop()
      this.portForwardManager = null
    }
  }
} 