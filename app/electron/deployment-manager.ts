import { promises as fs } from 'fs'
import crypto from 'crypto'
import { logger } from './logging-service'
import { ManifestManager } from './manifest'
import type { AppConfig } from '../src/types/app'

// We load k8s at runtime
import type { KubeConfig, CoreV1Api } from '@kubernetes/client-node'

type K8sModule = typeof import('@kubernetes/client-node')
let k8sPromise: Promise<K8sModule> | null = null
const getK8s = () => (k8sPromise ??= import('@kubernetes/client-node') as Promise<K8sModule>)

export class DeploymentManager {
  private static instance: DeploymentManager
  private manifestManager = ManifestManager.getInstance()

  private constructor() {}

  public static getInstance(): DeploymentManager {
    if (!DeploymentManager.instance) DeploymentManager.instance = new DeploymentManager()
    return DeploymentManager.instance
  }

  /**
   * Hash kubeconfig contents to produce stable unique ID.
   */
  public async computeDeploymentName(kubeConfigPath: string): Promise<string> {
    const contents = await fs.readFile(kubeConfigPath, 'utf8')
    const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12)
    return `jupyter-${hash}`
  }

  /**
   * Ensure pod exists; create if missing. Returns pod name.
   */
  public async ensureDeployment(config: AppConfig, kc: KubeConfig): Promise<{ podName: string; created: boolean }> {
    const k8s = await getK8s()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const deploymentName = await this.computeDeploymentName(config.kubernetes.kubeConfigPath)
    const namespace = config.kubernetes.namespace || 'default'

    try {
      const resp = await coreApi.readNamespacedPod({ name: `${deploymentName}-0`, namespace })
      logger.info(`[DeploymentManager] Existing pod found: ${deploymentName}-0`)
      return { podName: `${deploymentName}-0`, created: false }
    } catch (e: any) {
      if (e.statusCode !== 404) throw e
      logger.info('[DeploymentManager] No existing pod found, creating manifests...')
    }

    // Need to create manifests
    const manifests = await this.manifestManager.buildManifests(config, deploymentName)
    const objectClient = k8s.KubernetesObjectApi.makeApiClient(kc)
    for (const m of manifests) {
      await objectClient.patch(m)
    }
    logger.info('[DeploymentManager] Submitted manifests to cluster.')
    return { podName: `${deploymentName}-0`, created: true }
  }
} 