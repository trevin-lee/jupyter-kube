import Store from 'electron-store'
import { logger } from './logging-service'
import { CondaConfigManager } from './conda-config'
import { GitConfigManager } from './git-config'
import { KubeConfigManager } from './kube-config'
import { ElectronAppState, CondaEnvironment, GitGlobalConfig, SSHKeyInfo, AppKubeConfig, HardwareConfig } from '../src/types/app'
import { promises as fs } from 'fs'

export class FormStateManager {
  private static instance: FormStateManager
  private store: Store<ElectronAppState>
  private condaManager: CondaConfigManager
  private gitManager: GitConfigManager
  private kubeManager: KubeConfigManager
  private hardwareConfig: HardwareConfig
  private readonly defaults: ElectronAppState

  private constructor() {
    const defaultHardware: HardwareConfig = {
      cpu: '',
      memory: '',
      gpu: 'none',
      gpuCount: 0,
      pvcs: []
    }

    this.defaults = {
      condaConfig: { environments: [] },
      gitConfig: { 
        globalConfig: { 
          username: '', 
          email: '' 
        }, 
        sshKeys: [] 
      },
      kubeConfig: {
        kubeConfigPath: '',
        currentContext: null,
        namespace: '',
        availableNamespaces: []
      },
      hardwareConfig: defaultHardware
    }

    this.store = new Store<ElectronAppState>({
      name: 'app-config',
      defaults: this.defaults
    })

    this.condaManager = CondaConfigManager.getInstance()
    this.gitManager = GitConfigManager.getInstance()
    this.kubeManager = KubeConfigManager.getInstance()
    this.hardwareConfig = defaultHardware

    logger.info(
      `[FormStateManager] Initialized. Config file path: ${this.store.path}`
    )
  }

  public static getInstance(): FormStateManager {
    if (!FormStateManager.instance) {
      FormStateManager.instance = new FormStateManager()
    }
    return FormStateManager.instance
  }

  public setHardwareConfig(config: HardwareConfig): void {
    this.hardwareConfig = config
  }

  public getHardwareConfig(): HardwareConfig {
    return this.hardwareConfig
  }

  public saveState(): void {
    const currentState: ElectronAppState = {
      condaConfig: this.condaManager.getConfig(),
      gitConfig: this.gitManager.getConfig(),
      kubeConfig: this.kubeManager.getConfig(),
      hardwareConfig: this.hardwareConfig
    }
    try {
      this.store.set(currentState)
      logger.info(
        '[FormStateManager] Application state saved successfully.'
      )
    } catch (error) {
      logger.error('[FormStateManager] Failed to save application state:', error)
    }
  }

  public async loadState(): Promise<ElectronAppState> {
    try {
      const loadedState = this.store.store
      if (loadedState) {
        this.condaManager.setConfig(loadedState.condaConfig)
        
        // Load hardware config if present
        if (loadedState.hardwareConfig) {
          this.hardwareConfig = loadedState.hardwareConfig
          logger.info('[FormStateManager] Hardware configuration loaded:', this.hardwareConfig)
        }
        
        // For SSH keys, load content and extract tags if they're missing
        const gitConfig = loadedState.gitConfig
        if (gitConfig.sshKeys && gitConfig.sshKeys.length > 0) {
          for (const key of gitConfig.sshKeys) {
            if (key.path) {
              try {
                // Load the private key content if not already loaded
                if (!key.content) {
                  key.content = await fs.readFile(key.path, 'utf8')
                  const keyPreview = key.content.substring(0, 50).replace(/\n/g, '\\n')
                  logger.info(`[FormStateManager] Loaded SSH key from ${key.path}, starts with: ${keyPreview}...`)
                }
                
                // Extract tag from public key if not already present
                if (!key.tag) {
                  try {
                    const pubKeyPath = `${key.path}.pub`
                    const pubKeyContent = await fs.readFile(pubKeyPath, 'utf8')
                    key.tag = this.gitManager.extractSSHKeyTag(pubKeyContent)
                  } catch (err) {
                    // Public key might not exist
                    logger.debug(`[FormStateManager] Could not read public key for ${key.path}`)
                  }
                }
              } catch (err) {
                // Key might not be accessible
                logger.debug(`[FormStateManager] Could not read SSH key ${key.path}:`, err)
              }
            }
          }
        }
        
        this.gitManager.setConfig(gitConfig)
        this.kubeManager.setConfig(loadedState.kubeConfig)
        logger.info('[FormStateManager] Application state loaded successfully.')
        return loadedState
      }
      throw new Error('Loaded state is empty or undefined.')
    } catch (error) {
      logger.error(
        '[FormStateManager] Failed to load application state, falling back to defaults:',
        error
      )

      this.condaManager.setConfig(this.defaults.condaConfig)
      this.gitManager.setConfig(this.defaults.gitConfig)
      this.kubeManager.setConfig(this.defaults.kubeConfig)
      this.hardwareConfig = this.defaults.hardwareConfig
      return this.defaults
    }
  }

  public getFullConfig(): ElectronAppState {
    return {
      condaConfig: this.condaManager.getConfig(),
      gitConfig: this.gitManager.getConfig(),
      kubeConfig: this.kubeManager.getConfig(),
      hardwareConfig: this.hardwareConfig
    }
  }
}