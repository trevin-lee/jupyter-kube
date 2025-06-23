import { AppConfig } from '../types/app'
import { extractSSHKeyTag } from './git-config'
import logger from './logger'

export class AppConfigManager {
  private get isElectron(): boolean {
    return typeof window !== 'undefined' && window.electronAPI !== undefined
  }

  private getLocalStorageKey(key: string): string {
    return `jupyter-kube-${key}`
  }

  // Get the complete configuration
  async getConfig(): Promise<AppConfig> {
    logger.info('🔍 Getting config, isElectron:', this.isElectron)
    
    if (this.isElectron) {
      try {
        const config = await window.electronAPI.config.getConfig()
        logger.info('📁 Loaded config from Electron. Type:', typeof config, 'Keys:', Object.keys(config || {}))
        logger.info('📁 Hardware section:', config?.hardware)
        return config
      } catch (error) {
        logger.error('❌ Failed to get config from Electron:', error)
        throw error
      }
    } else {
      // Fallback to localStorage for browser mode
      const stored = localStorage.getItem(this.getLocalStorageKey('config'))
      if (stored) {
        try {
          const config = JSON.parse(stored)
          logger.info('📁 Loaded config from localStorage:', config)
          return config
        } catch (error) {
          logger.error('Failed to parse config from localStorage:', error)
        }
      }
      // Return default config if nothing stored
      logger.info('🆕 Using default config')
      return this.getDefaultConfig()
    }
  }

  // Save the complete configuration
  async setConfig(config: AppConfig): Promise<boolean> {
    logger.info('💾 Saving config:', config)
    
    if (this.isElectron) {
      try {
        const result = await window.electronAPI.config.setConfig(config)
        logger.info('✅ Config saved to Electron successfully')
        return result
      } catch (error) {
        logger.error('❌ Failed to set config in Electron:', error)
        throw error
      }
    } else {
      // Fallback to localStorage for browser mode
      try {
        localStorage.setItem(this.getLocalStorageKey('config'), JSON.stringify(config))
        logger.info('✅ Config saved to localStorage successfully')
        return true
      } catch (error) {
        logger.error('Failed to save config to localStorage:', error)
        return false
      }
    }
  }

  // Get a specific configuration section
  async getSection<K extends keyof AppConfig>(section: K): Promise<AppConfig[K]> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.getSection(section)
      } catch (error) {
        logger.error(`Failed to get section ${section}:`, error)
        throw error
      }
    } else {
      const config = await this.getConfig()
      return config[section]
    }
  }

  // Save a specific configuration section
  async setSection<K extends keyof AppConfig>(section: K, value: AppConfig[K]): Promise<boolean> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.setSection(section, value)
      } catch (error) {
        logger.error(`Failed to set section ${section}:`, error)
        throw error
      }
    } else {
      const config = await this.getConfig()
      config[section] = value
      return await this.setConfig(config)
    }
  }

  // Get a nested configuration value
  async getValue<K extends keyof AppConfig, NK extends keyof AppConfig[K]>(
    section: K,
    key: NK
  ): Promise<AppConfig[K][NK]> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.getValue(section, key as string)
      } catch (error) {
        logger.error(`Failed to get value ${section}.${String(key)}:`, error)
        throw error
      }
    } else {
      const sectionData = await this.getSection(section)
      return (sectionData as any)[key]
    }
  }

  // Set a nested configuration value
  async setValue<K extends keyof AppConfig, NK extends keyof AppConfig[K]>(
    section: K,
    key: NK,
    value: AppConfig[K][NK]
  ): Promise<boolean> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.setValue(section, key as string, value)
      } catch (error) {
        logger.error(`Failed to set value ${section}.${String(key)}:`, error)
        throw error
      }
    } else {
      const sectionData = await this.getSection(section)
      const updatedSection = { ...sectionData, [key as any]: value }
      return await this.setSection(section, updatedSection)
    }
  }

  // Reset configuration to defaults
  async reset(): Promise<boolean> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.reset()
      } catch (error) {
        logger.error('Failed to reset config:', error)
        throw error
      }
    } else {
      localStorage.removeItem(this.getLocalStorageKey('config'))
      return true
    }
  }

  // Reset a specific section
  async resetSection<K extends keyof AppConfig>(section: K): Promise<boolean> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.resetSection(section)
      } catch (error) {
        logger.error(`Failed to reset section ${section}:`, error)
        throw error
      }
    } else {
      const config = await this.getConfig()
      const defaultConfig = this.getDefaultConfig()
      config[section] = defaultConfig[section]
      return await this.setConfig(config)
    }
  }

  // Check if configuration exists
  async hasConfig(): Promise<boolean> {
    if (this.isElectron) {
      try {
        const hasConfig = await window.electronAPI.config.hasConfig()
        logger.info('🔍 hasConfig() result:', hasConfig)
        return hasConfig
      } catch (error) {
        logger.error('Failed to check config existence:', error)
        return false
      }
    } else {
      const hasLocalConfig = localStorage.getItem(this.getLocalStorageKey('config')) !== null
      logger.info('🔍 hasConfig() localStorage result:', hasLocalConfig)
      return hasLocalConfig
    }
  }

  // Get configuration file path (Electron only)
  async getConfigPath(): Promise<string | null> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.getConfigPath()
      } catch (error) {
        logger.error('Failed to get config path:', error)
        return null
      }
    } else {
      return 'localStorage' // Indicate it's stored in browser localStorage
    }
  }

  // Export configuration as JSON
  async exportConfig(): Promise<string> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.exportConfig()
      } catch (error) {
        logger.error('Failed to export config:', error)
        throw error
      }
    } else {
      const config = await this.getConfig()
      return JSON.stringify(config, null, 2)
    }
  }

  // Import configuration from JSON
  async importConfig(configJson: string): Promise<boolean> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.importConfig(configJson)
      } catch (error) {
        logger.error('Failed to import config:', error)
        throw error
      }
    } else {
      try {
        const config = JSON.parse(configJson)
        return await this.setConfig(config)
      } catch (error) {
        logger.error('Failed to parse imported config:', error)
        return false
      }
    }
  }

  // Validate configuration
  async validateConfig(config: AppConfig): Promise<{ valid: boolean; errors: string[] }> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.validateConfig(config)
      } catch (error) {
        logger.error('Failed to validate config:', error)
        return { valid: false, errors: ['Validation failed'] }
      }
    } else {
      // Simple client-side validation
      const errors: string[] = []
      
      if (!config.hardware.cpu) {
        errors.push('CPU configuration is required')
      }
      if (!config.hardware.memory) {
        errors.push('Memory configuration is required')
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
    }
  }

  // Get configuration summary
  async getConfigSummary(): Promise<string> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.getConfigSummary()
      } catch (error) {
        logger.error('Failed to get config summary:', error)
        throw error
      }
    } else {
      const config = await this.getConfig()
      return `
Configuration Summary:
- Hardware: ${config.hardware.cpu} CPU, ${config.hardware.memory} RAM, ${config.hardware.gpu} GPU
- Kubernetes: ${config.kubernetes.kubeConfigPath ? 'Configured' : 'Not configured'}
- Git: ${config.git.username || 'No username'} <${config.git.email || 'No email'}>
- SSH Key: ${config.git.sshKeyPath ? 'Configured' : 'Not configured'}
- Environments: ${config.environment.condaEnvironments.length} conda environments
- Storage: Browser localStorage
      `.trim()
    }
  }

  // Helper to get default configuration
  private getDefaultConfig(): AppConfig {
    return {
      hardware: {
        cpu: '',
        memory: '',
        gpu: 'none',
        gpuCount: 0,
        pvcs: []
      },
      kubernetes: {
        kubeConfigPath: '',
        namespace: ''
      },
      git: {
        username: '',
        email: '',
        sshKeyPath: '',
        sshKeyTag: '',
        enableSSHKeyDeployment: true,
        sshKeyDeploymentValidated: false
      },
      environment: {
        condaEnvironments: []
      },
      deployment: {
        enableGitIntegration: true,
        sshKeySecretName: undefined
      }
    }
  }

  // Auto-save helper - debounced save for frequent updates
  private saveTimeout: NodeJS.Timeout | null = null
  
  async autoSave(config: AppConfig, delay: number = 1000): Promise<void> {
    logger.info(`⏱️ Auto-save scheduled in ${delay}ms...`)
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      logger.info('🔄 Cleared previous auto-save timer')
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        logger.info('🚀 Executing auto-save...')
        await this.setConfig(config)
        logger.info('✅ Configuration auto-saved successfully')
      } catch (error) {
        logger.error('❌ Auto-save failed:', error)
      }
    }, delay)
  }

  // Load configuration with smart auto-detection
  async getConfigWithAutoDetection(): Promise<AppConfig> {
    logger.info('🧠 Starting smart auto-detection...')
    
    // First, load any existing saved configuration
    let config = await this.getConfig()
    logger.info('📋 Base config loaded:', JSON.stringify(config, null, 2))
    
    // Normalize GPU configuration (fix inconsistent states)
    if (config.hardware.gpu === 'none' && config.hardware.gpuCount > 0) {
      logger.info('🔧 Normalizing GPU config: Setting gpuCount to 0 for "none" GPU type')
      config.hardware.gpuCount = 0
    }
    
    // Check if this is a completely fresh install (no config exists)
    const hasExistingConfig = await this.hasConfig()
    logger.info('📁 Has existing config:', hasExistingConfig)
    
    if (!hasExistingConfig) {
      logger.info('🆕 Fresh install detected, will run full auto-detection')
    } else {
      logger.info('👤 Existing config found, checking what needs auto-detection...')
      logger.info('🔍 Saved values - Git username:', config.git.username || '(empty)')
      logger.info('🔍 Saved values - Git email:', config.git.email || '(empty)')
      logger.info('🔍 Saved values - SSH key:', config.git.sshKeyPath || '(empty)')
      logger.info('🔍 Saved values - Kubeconfig:', config.kubernetes.kubeConfigPath || '(empty)')
      logger.info('🔍 Saved values - CPU:', config.hardware.cpu || '(empty)')
      logger.info('🔍 Saved values - Memory:', config.hardware.memory || '(empty)')
    }
    
    // Track if we have user-entered changes that should be saved
    let hasUserChanges = false
    
    // Now run auto-detection only for missing/empty fields
    if (this.isElectron) {
      try {
        // Auto-detect git configuration only if not already saved
        if (!config.git.username || !config.git.email) {
          logger.info('🔎 Auto-detecting git configuration... (missing saved values)')
          const globalConfig = await window.electronAPI.git.getGlobalConfig()
          logger.info('🔎 Found global git config:', globalConfig)
          if (globalConfig) {
            const oldUsername = config.git.username
            const oldEmail = config.git.email
            config.git.username = config.git.username || globalConfig.username || ''
            config.git.email = config.git.email || globalConfig.email || ''
            logger.info('🔄 Git config updated:', {oldUsername, newUsername: config.git.username, oldEmail, newEmail: config.git.email})
            hasUserChanges = true // Git credentials are user data, should be saved
          }
        } else {
          logger.info('✅ Git configuration already saved, skipping auto-detection')
          logger.info('   Username:', config.git.username, 'Email:', config.git.email)
        }

        // Auto-detect SSH keys only if not already saved, OR if saved but missing tag
        if (!config.git.sshKeyPath || !config.git.sshKeyTag) {
          if (!config.git.sshKeyPath) {
            logger.info('🔎 Auto-detecting SSH keys... (no saved SSH key)')
          } else {
            logger.info('🔎 Auto-detecting SSH key tag... (missing saved tag for existing key)')
          }
          
          const sshKeys = await window.electronAPI.git.detectSSHKeys()
          let selectedKey = null
          
          if (config.git.sshKeyPath) {
            // Find the existing saved key in the detected keys
            selectedKey = sshKeys.find(key => key.path === config.git.sshKeyPath && key.exists)
            if (!selectedKey) {
              logger.warn('⚠️ Saved SSH key not found in detected keys, will try to extract tag from saved path')
            }
          } else {
            // Find the first available key for fresh detection
            selectedKey = sshKeys.find(key => key.exists)
          }
          
          if (selectedKey || config.git.sshKeyPath) {
            try {
              const keyPath = selectedKey ? selectedKey.path : config.git.sshKeyPath
              const keyContent = config.git.sshKeyContent || await window.electronAPI.git.readSSHKey(keyPath)
              
              // Try to extract the SSH key tag from the public key
              let keyTag = config.git.sshKeyTag || ''
              if (!keyTag) {
                try {
                  // First try to read the corresponding public key for the tag
                  const publicKeyPath = keyPath.endsWith('.pub') ? keyPath : `${keyPath}.pub`
                  const publicKeyContent = await window.electronAPI.git.readSSHKey(publicKeyPath)
                  keyTag = extractSSHKeyTag(publicKeyContent)
                  logger.info('🏷️ Extracted SSH key tag from public key:', keyTag)
                } catch (error) {
                  // If no public key, try to extract from private key
                  keyTag = extractSSHKeyTag(keyContent)
                  logger.info('🏷️ Extracted SSH key tag from private key:', keyTag)
                }
              }
              
              const hasNewData = !config.git.sshKeyPath || !config.git.sshKeyContent || !config.git.sshKeyTag
              
              config.git.sshKeyPath = keyPath
              config.git.sshKeyContent = keyContent
              config.git.sshKeyTag = keyTag
              
              if (hasNewData) {
                logger.info('🔄 SSH key updated:', keyPath, 'with tag:', keyTag)
                hasUserChanges = true // Save the updated SSH key data
              } else {
                logger.info('✅ SSH key data already complete')
              }
            } catch (error) {
              logger.error('❌ Failed to read SSH key:', error)
            }
          } else {
            logger.info('ℹ️ No SSH keys found during auto-detection')
          }
        } else {
          logger.info('✅ SSH key and tag already saved, skipping auto-detection')
          logger.info('   SSH key path:', config.git.sshKeyPath)
          logger.info('   SSH key tag:', config.git.sshKeyTag)
          // Try to load the SSH key content if missing but path exists
          if (!config.git.sshKeyContent && config.git.sshKeyPath) {
            try {
              const keyContent = await window.electronAPI.git.readSSHKey(config.git.sshKeyPath)
              config.git.sshKeyContent = keyContent
              logger.info('🔄 Loaded SSH key content for saved path')
            } catch (error) {
              logger.error('❌ Failed to load SSH key content for saved path:', error)
            }
          }
        }

        // Auto-detect kubeconfig only if not already saved
        if (!config.kubernetes.kubeConfigPath) {
          logger.info('🔎 Auto-detecting kubeconfig... (no saved kubeconfig)')
          const detection = await window.electronAPI.kubeconfig.detect()
          if (detection && detection.found && detection.path) {
            config.kubernetes.kubeConfigPath = detection.path
            logger.info('🔄 Kubeconfig auto-detected:', detection.path)
            hasUserChanges = true // Save the detected kubeconfig
          } else {
            logger.info('ℹ️ No kubeconfig found during auto-detection')
          }
        } else {
          logger.info('✅ Kubeconfig already saved, skipping auto-detection')
          logger.info('   Kubeconfig path:', config.kubernetes.kubeConfigPath)
        }

        // Save configuration if we made any changes
        if (hasUserChanges) {
          logger.info('💾 Saving updated configuration with new auto-detected values')
          await this.setConfig(config)
          logger.info('✅ Configuration saved successfully')
        } else {
          logger.info('ℹ️ No changes made, using existing saved configuration')
        }
        
      } catch (error) {
        logger.error('Auto-detection failed:', error)
      }
    }
    
    logger.info('🏁 Final config (respecting saved values):', JSON.stringify(config, null, 2))
    return config
  }

  // Check if a configuration field is empty/default
  private isFieldEmpty(value: any): boolean {
    if (value === null || value === undefined || value === '') {
      return true
    }
    if (Array.isArray(value) && value.length === 0) {
      return true
    }
    return false
  }

  // Get configuration summary with auto-detection status
  async getConfigSummaryWithStatus(): Promise<string> {
    const config = await this.getConfig()
    const hasExistingConfig = await this.hasConfig()
    
    const autoDetectedFields: string[] = []
    
    if (config.git.username || config.git.email) {
      autoDetectedFields.push('Git credentials')
    }
    if (config.git.sshKeyPath) {
      autoDetectedFields.push('SSH key')
    }
    if (config.kubernetes.kubeConfigPath) {
      autoDetectedFields.push('Kubeconfig')
    }
    
    const summary = await this.getConfigSummary()
    const statusInfo = `
Status: ${hasExistingConfig ? 'Loaded from saved config' : 'Fresh installation'}
Auto-detected: ${autoDetectedFields.length > 0 ? autoDetectedFields.join(', ') : 'None'}
    `
    
    return summary + '\n' + statusInfo
  }
}

// Export singleton instance
export const configService = new AppConfigManager() 