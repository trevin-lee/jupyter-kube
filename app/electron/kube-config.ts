// We load the ESM-only @kubernetes/client-node at runtime via dynamic import
type K8s = typeof import('@kubernetes/client-node')

let k8sPromise: Promise<K8s> | null = null
function getK8s(): Promise<K8s> {
  if (!k8sPromise) {
    /* Use a runtime dynamic import to ensure we load the ESM build even
       when this file is transpiled to CommonJS. Creating the import
       function via the Function constructor prevents TypeScript from
       transforming the `import()` call into `require()`. */
    const dynamicImporter = new Function(
      'modulePath',
      'return import(modulePath)'
    ) as (path: string) => Promise<K8s>

    k8sPromise = dynamicImporter('@kubernetes/client-node')
  }
  return k8sPromise
}

import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from './logging-service'
import { AppKubeConfig } from '../src/types/app'

export class KubeConfigManager {
  private static instance: KubeConfigManager
  private config: AppKubeConfig
  private k8sConfig: any = null

  private constructor() {
    this.config = {
      kubeConfigPath: null,
      currentContext: null,
      namespace: null,
      availableNamespaces: []
    }
  }

  public static getInstance(): KubeConfigManager {
    if (!KubeConfigManager.instance) {
      KubeConfigManager.instance = new KubeConfigManager()
    }
    return KubeConfigManager.instance
  }

  public getConfig(): AppKubeConfig {
    return this.config
  }

  public setConfig(newConfig: AppKubeConfig): void {
    this.config = newConfig
  }

  public async autoDetectKubeConfig(): Promise<AppKubeConfig> {
    logger.info('[KubeConfigManager] Starting auto-detection...')
    
    // Reset state before detection
    this.config = {
      kubeConfigPath: null,
      currentContext: null,
      namespace: null,
      availableNamespaces: []
    }
    
    const configPath = await this.detectKubeConfigPath()

    if (configPath) {
      this.config.kubeConfigPath = configPath
      logger.info(
        `[KubeConfigManager] Found kubeconfig file at: ${configPath}`
      )
      try {
        const k8s = await getK8s()
        if (!this.k8sConfig) this.k8sConfig = new k8s.KubeConfig()
        const fileContent = await fs.readFile(configPath, { encoding: 'utf8' })
        this.k8sConfig.loadFromString(fileContent)

        const currentContext = this.k8sConfig.getCurrentContext()
        this.config.currentContext = currentContext
        logger.info(`[KubeConfigManager] Current context: ${currentContext}`)

        const contextObject = this.k8sConfig.getContextObject(currentContext)
        if (contextObject?.namespace) {
          this.config.namespace = contextObject.namespace
          logger.info(
            `[KubeConfigManager] Detected namespace from context: ${contextObject.namespace}`
          )
        } else {
          logger.info(
            `[KubeConfigManager] No namespace specified in current context.`
          )
          this.config.namespace = null
        }

        const contexts = this.k8sConfig.getContexts()
        const namespaces = contexts
          .map((c: { namespace?: string }) => c.namespace)
          .filter((ns: string | undefined): ns is string => !!ns)
        this.config.availableNamespaces = Array.from(new Set(namespaces))
        logger.info(
          `[KubeConfigManager] Found ${this.config.availableNamespaces.length} unique namespaces in contexts.`
        )
      } catch (error) {
        logger.error(
          `[KubeConfigManager] Error loading or parsing kubeconfig file from ${configPath} \nStack: ${(error as Error).stack}`
        )
        // Reset if loading fails, but keep path to show user the problematic file
        this.config = {
          kubeConfigPath: configPath,
          currentContext: null,
          namespace: null,
          availableNamespaces: []
        }
      }
    } else {
      logger.warn('[KubeConfigManager] No kubeconfig file found.')
    }

    return this.config
  }

  private async detectKubeConfigPath(): Promise<string | null> {
    const envPath = process.env.KUBECONFIG
    if (envPath) {
      logger.info(
        `[KubeConfigManager] Found KUBECONFIG environment variable: ${envPath}`
      )
      const paths = envPath.split(path.delimiter)
      for (const p of paths) {
        try {
          await fs.access(p)
          logger.info(
            `[KubeConfigManager] Using first valid path from KUBECONFIG: ${p}`
          )
          return p
        } catch {
        }
      }
    }

    const defaultPath = path.join(os.homedir(), '.kube', 'config')
    try {
      await fs.access(defaultPath)
      logger.info(
        `[KubeConfigManager] Found kubeconfig at default path: ${defaultPath}`
      )
      return defaultPath
    } catch {
      logger.warn(
        `[KubeConfigManager] No kubeconfig file found at default path.`
      )
      return null
    }
  }
}