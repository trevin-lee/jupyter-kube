// We load the ESM-only @kubernetes/client-node at runtime via dynamic import
type K8s = typeof import('@kubernetes/client-node')

let k8sPromise: Promise<K8s> | null = null
function getK8s(): Promise<K8s> {
  if (!k8sPromise) {
    const dynamicImporter = new Function(
      'modulePath',
      'return import(modulePath)'
    ) as (path: string) => Promise<K8s>

    k8sPromise = dynamicImporter('@kubernetes/client-node')
  }
  return k8sPromise
}

import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import Store from 'electron-store'
import { app, dialog } from 'electron'
import { logger } from './logging-service'
import { AppKubeConfig } from '../src/types/app'
import { pathExistsSync } from 'fs-extra'

export interface IKubeConfig {
  kubeConfigPath: string | null
  namespace: string | null
}

export class KubeConfigManager {
  private static instance: KubeConfigManager
  private config: AppKubeConfig
  private k8sConfig: any = null
  private configPath: string | null = null
  private namespace: string = 'default'

  private constructor() {
    this.config = {
      kubeConfigPath: null,
      currentContext: null,
      namespace: null,
      availableNamespaces: []
    }
    this.loadDefaultConfig()
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
        const fileContent = await fs.promises.readFile(configPath, { encoding: 'utf8' })
        
        // Load the kubeconfig as-is
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

  /**
   * Detects namespaces from the current kubeconfig without resetting the configuration
   */
  public async detectNamespaces(): Promise<{namespace: string | null, availableNamespaces: string[]}> {
    logger.info('[KubeConfigManager] Detecting namespaces...')
    
    if (!this.config.kubeConfigPath) {
      logger.warn('[KubeConfigManager] No kubeconfig path set, cannot detect namespaces')
      return { namespace: null, availableNamespaces: [] }
    }
    
    try {
      const k8s = await getK8s()
      if (!this.k8sConfig) this.k8sConfig = new k8s.KubeConfig()
      const fileContent = await fs.promises.readFile(this.config.kubeConfigPath, { encoding: 'utf8' })
      
      // Load the kubeconfig
      this.k8sConfig.loadFromString(fileContent)
      
      const currentContext = this.k8sConfig.getCurrentContext()
      const contextObject = this.k8sConfig.getContextObject(currentContext)
      
      let detectedNamespace = null
      if (contextObject?.namespace) {
        detectedNamespace = contextObject.namespace
        logger.info(`[KubeConfigManager] Detected namespace from context: ${detectedNamespace}`)
      }
      
      // Get all unique namespaces from contexts
      const contexts = this.k8sConfig.getContexts()
      const namespaces = contexts
        .map((c: any) => c.namespace as string | undefined)
        .filter((ns: string | undefined): ns is string => !!ns)
      const availableNamespaces: string[] = Array.from(new Set(namespaces))
      
      logger.info(`[KubeConfigManager] Found ${availableNamespaces.length} unique namespaces in contexts`)
      
      // Update the stored config with detected values
      this.config.namespace = detectedNamespace
      this.config.availableNamespaces = availableNamespaces
      
      return { namespace: detectedNamespace, availableNamespaces }
    } catch (error) {
      logger.error(`[KubeConfigManager] Error detecting namespaces: ${(error as Error).message}`)
      return { namespace: null, availableNamespaces: [] }
    }
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
          await fs.promises.access(p)
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
      await fs.promises.access(defaultPath)
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

  private loadDefaultConfig() {
    const defaultPath = path.join(os.homedir(), '.kube', 'config')
    if (pathExistsSync(defaultPath)) {
      this.configPath = defaultPath
    }
  }

  /**
   * Configures the PATH environment variable to include kubectl and OIDC plugins for authentication
   * This is necessary because @kubernetes/client-node needs to spawn kubectl and plugins for exec authentication
   */
  public static async configureKubectlPath(): Promise<void> {
    const possiblePaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/opt/homebrew/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'bin'),
      path.join(os.homedir(), '.krew', 'bin'), // kubectl krew plugin directory
      // Windows paths
      'C:\\Program Files\\kubectl',
      'C:\\kubectl',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
      path.join(process.env.APPDATA || '', 'krew', 'bin'), // Windows krew directory
    ]

    const currentPath = process.env.PATH || ''
    const pathDirs = currentPath.split(path.delimiter)
    const dirsToAdd: string[] = []
    
    // Find kubectl and OIDC plugins in the system
    for (const dir of possiblePaths) {
      if (!pathDirs.includes(dir)) {
        try {
          // Check if directory exists
          await fs.promises.access(dir, fs.constants.R_OK)
          
          // Look for kubectl and various OIDC plugins
          const executableNames = [
            'kubectl',
            'kubectl-oidc_login',  // Common name for the plugin
            'kubectl-oidc-login',  // Alternative naming
            'kubelogin',          // Azure/general OIDC login tool
          ]
          
          let foundExecutable = false
          for (const execName of executableNames) {
            const execPath = path.join(dir, process.platform === 'win32' ? `${execName}.exe` : execName)
            try {
              await fs.promises.access(execPath, fs.constants.X_OK)
              foundExecutable = true
              logger.info(`[KubeConfigManager] Found ${execName} at: ${execPath}`)
            } catch {
              // Continue checking other executables
            }
          }
          
          if (foundExecutable) {
            dirsToAdd.push(dir)
          }
        } catch (error) {
          // Directory doesn't exist or isn't accessible
        }
      }
    }
    
    // Add all found directories to PATH
    if (dirsToAdd.length > 0) {
      process.env.PATH = dirsToAdd.join(path.delimiter) + path.delimiter + currentPath
      logger.info(`[KubeConfigManager] Added to PATH for kubectl/OIDC: ${dirsToAdd.join(', ')}`)
      
      // Log the final PATH for debugging
      logger.debug(`[KubeConfigManager] Updated PATH: ${process.env.PATH}`)
    } else {
      logger.warn('[KubeConfigManager] No kubectl or OIDC authentication plugins found in common locations')
      logger.warn('[KubeConfigManager] Current PATH: ' + currentPath)
      logger.warn('[KubeConfigManager] You may need to install kubectl and kubectl-oidc_login plugin')
    }
  }
}