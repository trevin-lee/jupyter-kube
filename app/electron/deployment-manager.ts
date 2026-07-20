import { promises as fs } from 'fs'
import crypto from 'crypto'
import { logger } from './logging-service'
import { ManifestManager } from './manifest'
import { PortForwardManager } from './portforward-manager'
import type { AppConfig } from '../src/types/app'

import type * as k8sTypes from '@kubernetes/client-node'
import type { KubeConfig, CoreV1Api, AppsV1Api } from '@kubernetes/client-node'
import { getK8s } from './k8s-client'
import { DEFAULT_NAMESPACE, LABELS, podNameFor } from './constants'
import { detectDrift } from './drift'

export interface DeploymentStatus {
  exists: boolean
  podName?: string
  statefulSetName?: string
  ready?: boolean
  phase?: string
  message?: string
  /** The live StatefulSet, when one exists — used to detect config drift. */
  statefulSet?: k8sTypes.V1StatefulSet
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
      const podName = podNameFor(deploymentName)
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
          statefulSet,
          message: `Found existing deployment ${deploymentName}`
        }
      } catch (podError: any) {
        if (podError.statusCode === 404 || podError.body?.code === 404 || podError.code === 404) {
          return {
            exists: true,
            statefulSetName: deploymentName,
            ready: false,
            statefulSet,
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
   * Delete a deployment and everything belonging to it, then wait for the pod to
   * actually disappear so the replacement StatefulSet can claim the same name.
   *
   * Companion objects (SSH Secret, conda ConfigMaps) are deleted too, so their
   * regenerated contents are picked up rather than the stale copies being reused.
   */
  private async deleteStatefulSetAndWait(
    deploymentName: string,
    namespace: string,
    kc: KubeConfig
  ): Promise<void> {
    const k8s = await getK8s()
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const labelSelector = `${LABELS.instance}=${deploymentName}`

    const ignoreMissing = (kind: string) => (error: any) => {
      if (error?.statusCode === 404 || error?.body?.code === 404 || error?.code === 404) return
      logger.warn(`[DeploymentManager] Failed to delete ${kind}: ${error?.message}`)
    }

    await coreApi
      .deleteCollectionNamespacedConfigMap({ namespace, labelSelector })
      .catch(ignoreMissing('ConfigMaps'))
    await coreApi
      .deleteCollectionNamespacedSecret({ namespace, labelSelector })
      .catch(ignoreMissing('Secrets'))
    await appsApi
      .deleteNamespacedStatefulSet({ name: deploymentName, namespace })
      .catch(ignoreMissing('StatefulSet'))

    // Wait for the pod to terminate. Creating a StatefulSet whose pod name is still
    // held by a terminating pod leaves the new one stuck Pending.
    const podName = podNameFor(deploymentName)
    const timeoutMs = 120000
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      try {
        await coreApi.readNamespacedPod({ name: podName, namespace })
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.body?.code === 404 || error?.code === 404) {
          logger.info(`[DeploymentManager] Old pod ${podName} terminated.`)
          return
        }
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    logger.warn(
      `[DeploymentManager] Timed out waiting for ${podName} to terminate; continuing anyway.`
    )
  }

  /**
   * Ensure pod exists; create if missing. Returns deployment info.
   *
   * `onDrift` is invoked when an existing deployment is found whose spec no longer
   * matches the current config, just before it is replaced.
   */
  public async ensureDeployment(
    config: AppConfig,
    kc: KubeConfig,
    onDrift?: (changes: string[]) => void
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
    const namespace = config.kubernetes.namespace || DEFAULT_NAMESPACE

    // Render the desired manifests up front so we can compare them against whatever
    // is already running. Building manifests is pure object construction — no I/O.
    const manifests = await this.manifestManager.buildManifests(config, deploymentName)
    const desiredStatefulSet = manifests.find(
      (m) => m.kind === 'StatefulSet'
    ) as k8sTypes.V1StatefulSet | undefined

    // Check for existing deployment
    const status = await this.checkExistingDeployment(deploymentName, namespace, kc)

    if (status.exists && desiredStatefulSet) {
      const drift = detectDrift(status.statefulSet, desiredStatefulSet)

      if (drift.length > 0) {
        // The running pod no longer matches the config on screen. Reusing it would
        // silently ignore the user's changes, so replace it. Safe to delete: all
        // persistent data lives in externally-managed PVCs, never in the pod.
        logger.info(
          `[DeploymentManager] Config changed (${drift.join(', ')}) — replacing deployment ${deploymentName}`
        )
        onDrift?.(drift)
        await this.deleteStatefulSetAndWait(deploymentName, namespace, kc)
      } else if (status.ready) {
        logger.info(`[DeploymentManager] Using existing ready deployment: ${deploymentName}`)
        return {
          podName: status.podName!,
          created: false,
          existingDeployment: true
        }
      } else {
        logger.info(`[DeploymentManager] Existing deployment found but not ready, waiting...`)
        return {
          podName: podNameFor(deploymentName),
          created: false,
          existingDeployment: true
        }
      }
    }

    // Need to create new deployment
    logger.info('[DeploymentManager] Creating new deployment...')
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
      podName: podNameFor(deploymentName), 
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