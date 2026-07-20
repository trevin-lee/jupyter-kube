import { getK8s } from './k8s-client'

import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
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

  /**
   * Load a kubeconfig file and read the context/namespace information out of it.
   *
   * Note this only ever parses the kubeconfig *text* — `availableNamespaces` is the
   * set of `namespace:` fields declared on context entries, not a live list from the
   * API server. A kubeconfig with one context that has access to many namespaces
   * therefore yields exactly one entry.
   */
  private async inspectKubeConfig(configPath: string): Promise<{
    currentContext: string
    namespace: string | null
    availableNamespaces: string[]
  }> {
    const k8s = await getK8s()
    if (!this.k8sConfig) this.k8sConfig = new k8s.KubeConfig()
    const fileContent = await fs.promises.readFile(configPath, { encoding: 'utf8' })

    this.k8sConfig.loadFromString(fileContent)

    const currentContext = this.k8sConfig.getCurrentContext()
    logger.info(`[KubeConfigManager] Current context: ${currentContext}`)

    const contextObject = this.k8sConfig.getContextObject(currentContext)
    const namespace = contextObject?.namespace ?? null
    if (namespace) {
      logger.info(`[KubeConfigManager] Detected namespace from context: ${namespace}`)
    } else {
      logger.info('[KubeConfigManager] No namespace specified in current context.')
    }

    // `this.k8sConfig` is untyped (`any`), so annotate explicitly — otherwise the
    // Set round-trip widens back to unknown[].
    const namespaces: string[] = this.k8sConfig
      .getContexts()
      .map((c: { namespace?: string }) => c.namespace)
      .filter((ns: string | undefined): ns is string => !!ns)
    const availableNamespaces: string[] = Array.from(new Set(namespaces))
    logger.info(
      `[KubeConfigManager] Found ${availableNamespaces.length} unique namespaces in contexts.`
    )

    return { currentContext, namespace, availableNamespaces }
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
        const inspected = await this.inspectKubeConfig(configPath)
        this.config.currentContext = inspected.currentContext
        this.config.namespace = inspected.namespace
        this.config.availableNamespaces = inspected.availableNamespaces
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
      const { namespace, availableNamespaces } = await this.inspectKubeConfig(
        this.config.kubeConfigPath
      )

      // Update the stored config with detected values
      this.config.namespace = namespace
      this.config.availableNamespaces = availableNamespaces

      return { namespace, availableNamespaces }
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