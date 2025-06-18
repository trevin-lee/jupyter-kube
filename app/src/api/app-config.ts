import { AppConfig } from '../types/app'
import { extractSSHKeyTag } from './git-config'

export class AppConfigManager {
  private get isElectron(): boolean {
    return typeof window !== 'undefined' && window.electronAPI !== undefined
  }

  private getLocalStorageKey(key: string): string {
    return `jupyter-kube-${key}`
  }

  // Get the complete configuration
  async getConfig(): Promise<AppConfig> {
    console.log('🔍 Getting config, isElectron:', this.isElectron)
    
    if (this.isElectron) {
      try {
        const config = await window.electronAPI.config.getConfig()
        console.log('📁 Loaded config from Electron. Type:', typeof config, 'Keys:', Object.keys(config || {}))
        console.log('📁 Hardware section:', config?.hardware)
        return config
      } catch (error) {
        console.error('❌ Failed to get config from Electron:', error)
        throw error
      }
    } else {
      // Fallback to localStorage for browser mode
      const stored = localStorage.getItem(this.getLocalStorageKey('config'))
      if (stored) {
        try {
          const config = JSON.parse(stored)
          console.log('📁 Loaded config from localStorage:', config)
          return config
        } catch (error) {
          console.error('Failed to parse config from localStorage:', error)
        }
      }
      // Return default config if nothing stored
      console.log('🆕 Using default config')
      return this.getDefaultConfig()
    }
  }

  // Save the complete configuration
  async setConfig(config: AppConfig): Promise<boolean> {
    console.log('💾 Saving config:', config)
    
    if (this.isElectron) {
      try {
        const result = await window.electronAPI.config.setConfig(config)
        console.log('✅ Config saved to Electron successfully')
        return result
      } catch (error) {
        console.error('❌ Failed to set config in Electron:', error)
        throw error
      }
    } else {
      // Fallback to localStorage for browser mode
      try {
        localStorage.setItem(this.getLocalStorageKey('config'), JSON.stringify(config))
        console.log('✅ Config saved to localStorage successfully')
        return true
      } catch (error) {
        console.error('Failed to save config to localStorage:', error)
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
        console.error(`Failed to get section ${section}:`, error)
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
        console.error(`Failed to set section ${section}:`, error)
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
        console.error(`Failed to get value ${section}.${String(key)}:`, error)
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
        console.error(`Failed to set value ${section}.${String(key)}:`, error)
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
        console.error('Failed to reset config:', error)
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
        console.error(`Failed to reset section ${section}:`, error)
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
        console.log('🔍 hasConfig() result:', hasConfig)
        return hasConfig
      } catch (error) {
        console.error('Failed to check config existence:', error)
        return false
      }
    } else {
      const hasLocalConfig = localStorage.getItem(this.getLocalStorageKey('config')) !== null
      console.log('🔍 hasConfig() localStorage result:', hasLocalConfig)
      return hasLocalConfig
    }
  }

  // Get configuration file path (Electron only)
  async getConfigPath(): Promise<string | null> {
    if (this.isElectron) {
      try {
        return await window.electronAPI.config.getConfigPath()
      } catch (error) {
        console.error('Failed to get config path:', error)
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
        console.error('Failed to export config:', error)
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
        console.error('Failed to import config:', error)
        throw error
      }
    } else {
      try {
        const config = JSON.parse(configJson)
        return await this.setConfig(config)
      } catch (error) {
        console.error('Failed to parse imported config:', error)
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
        console.error('Failed to validate config:', error)
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
        console.error('Failed to get config summary:', error)
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
    console.log(`⏱️ Auto-save scheduled in ${delay}ms...`)
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      console.log('🔄 Cleared previous auto-save timer')
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        console.log('🚀 Executing auto-save...')
        await this.setConfig(config)
        console.log('✅ Configuration auto-saved successfully')
      } catch (error) {
        console.error('❌ Auto-save failed:', error)
      }
    }, delay)
  }

  // Load configuration with smart auto-detection
  async getConfigWithAutoDetection(): Promise<AppConfig> {
    console.log('🧠 Starting smart auto-detection...')
    
    // First, load any existing saved configuration
    let config = await this.getConfig()
    console.log('📋 Base config loaded:', JSON.stringify(config, null, 2))
    
    // Normalize GPU configuration (fix inconsistent states)
    if (config.hardware.gpu === 'none' && config.hardware.gpuCount > 0) {
      console.log('🔧 Normalizing GPU config: Setting gpuCount to 0 for "none" GPU type')
      config.hardware.gpuCount = 0
    }
    
    // Check if this is a completely fresh install (no config exists)
    const hasExistingConfig = await this.hasConfig()
    console.log('📁 Has existing config:', hasExistingConfig)
    
    if (!hasExistingConfig) {
      console.log('🆕 Fresh install detected, will run full auto-detection')
    } else {
      console.log('👤 Existing config found, checking what needs auto-detection...')
      console.log('🔍 Saved values - Git username:', config.git.username || '(empty)')
      console.log('🔍 Saved values - Git email:', config.git.email || '(empty)')
      console.log('🔍 Saved values - SSH key:', config.git.sshKeyPath || '(empty)')
      console.log('🔍 Saved values - Kubeconfig:', config.kubernetes.kubeConfigPath || '(empty)')
      console.log('🔍 Saved values - CPU:', config.hardware.cpu || '(empty)')
      console.log('🔍 Saved values - Memory:', config.hardware.memory || '(empty)')
    }
    
    // Track if we have user-entered changes that should be saved
    let hasUserChanges = false
    
    // Now run auto-detection only for missing/empty fields
    if (this.isElectron) {
      try {
        // Auto-detect git configuration only if not already saved
        if (!config.git.username || !config.git.email) {
          console.log('🔎 Auto-detecting git configuration... (missing saved values)')
          const globalConfig = await window.electronAPI.git.getGlobalConfig()
          console.log('🔎 Found global git config:', globalConfig)
          if (globalConfig) {
            const oldUsername = config.git.username
            const oldEmail = config.git.email
            config.git.username = config.git.username || globalConfig.username || ''
            config.git.email = config.git.email || globalConfig.email || ''
            console.log('🔄 Git config updated:', {oldUsername, newUsername: config.git.username, oldEmail, newEmail: config.git.email})
            hasUserChanges = true // Git credentials are user data, should be saved
          }
        } else {
          console.log('✅ Git configuration already saved, skipping auto-detection')
          console.log('   Username:', config.git.username, 'Email:', config.git.email)
        }

        // Auto-detect SSH keys only if not already saved, OR if saved but missing tag
        if (!config.git.sshKeyPath || !config.git.sshKeyTag) {
          if (!config.git.sshKeyPath) {
            console.log('🔎 Auto-detecting SSH keys... (no saved SSH key)')
          } else {
            console.log('🔎 Auto-detecting SSH key tag... (missing saved tag for existing key)')
          }
          
          const sshKeys = await window.electronAPI.git.detectSSHKeys()
          let selectedKey = null
          
          if (config.git.sshKeyPath) {
            // Find the existing saved key in the detected keys
            selectedKey = sshKeys.find(key => key.path === config.git.sshKeyPath && key.exists)
            if (!selectedKey) {
              console.log('⚠️ Saved SSH key not found in detected keys, will try to extract tag from saved path')
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
                  console.log('🏷️ Extracted SSH key tag from public key:', keyTag)
                } catch (error) {
                  // If no public key, try to extract from private key
                  keyTag = extractSSHKeyTag(keyContent)
                  console.log('🏷️ Extracted SSH key tag from private key:', keyTag)
                }
              }
              
              const hasNewData = !config.git.sshKeyPath || !config.git.sshKeyContent || !config.git.sshKeyTag
              
              config.git.sshKeyPath = keyPath
              config.git.sshKeyContent = keyContent
              config.git.sshKeyTag = keyTag
              
              if (hasNewData) {
                console.log('🔄 SSH key updated:', keyPath, 'with tag:', keyTag)
                hasUserChanges = true // Save the updated SSH key data
              } else {
                console.log('✅ SSH key data already complete')
              }
            } catch (error) {
              console.log('❌ Failed to read SSH key:', error)
            }
          } else {
            console.log('ℹ️ No SSH keys found during auto-detection')
          }
        } else {
          console.log('✅ SSH key and tag already saved, skipping auto-detection')
          console.log('   SSH key path:', config.git.sshKeyPath)
          console.log('   SSH key tag:', config.git.sshKeyTag)
          // Try to load the SSH key content if missing but path exists
          if (!config.git.sshKeyContent && config.git.sshKeyPath) {
            try {
              const keyContent = await window.electronAPI.git.readSSHKey(config.git.sshKeyPath)
              config.git.sshKeyContent = keyContent
              console.log('🔄 Loaded SSH key content for saved path')
            } catch (error) {
              console.log('❌ Failed to load SSH key content for saved path:', error)
            }
          }
        }

        // Auto-detect kubeconfig only if not already saved
        if (!config.kubernetes.kubeConfigPath) {
          console.log('🔎 Auto-detecting kubeconfig... (no saved kubeconfig)')
          const detection = await window.electronAPI.kubeconfig.detect()
          if (detection && detection.found && detection.path) {
            config.kubernetes.kubeConfigPath = detection.path
            console.log('🔄 Kubeconfig auto-detected:', detection.path)
            hasUserChanges = true // Save the detected kubeconfig
          } else {
            console.log('ℹ️ No kubeconfig found during auto-detection')
          }
        } else {
          console.log('✅ Kubeconfig already saved, skipping auto-detection')
          console.log('   Kubeconfig path:', config.kubernetes.kubeConfigPath)
        }

        // Save configuration if we made any changes
        if (hasUserChanges) {
          console.log('💾 Saving updated configuration with new auto-detected values')
          await this.setConfig(config)
          console.log('✅ Configuration saved successfully')
        } else {
          console.log('ℹ️ No changes made, using existing saved configuration')
        }
        
      } catch (error) {
        console.error('Auto-detection failed:', error)
      }
    }
    
    console.log('🏁 Final config (respecting saved values):', JSON.stringify(config, null, 2))
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