import Store from 'electron-store'
import { AppConfig } from '../src/types/app'
import { logger } from './logging-service'

// Define the store schema type
type StoreType = AppConfig & {
  configVersion?: string
}

// Schema for validation
const schema = {
  hardware: {
    type: 'object',
    properties: {
      cpu: { type: 'string' },
      memory: { type: 'string' },
      gpu: { type: 'string' },
      gpuCount: { type: 'number' },
      pvcs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            mountPath: { type: 'string' }
          }
        }
      }
    }
  },
  kubernetes: {
    type: 'object',
    properties: {
      kubeConfigPath: { type: 'string' }
    }
  },
  git: {
    type: 'object',
    properties: {
      username: { type: 'string' },
      email: { type: 'string' },
      sshKeyPath: { type: 'string' },
      sshKeyTag: { type: 'string' },
      enableSSHKeyDeployment: { type: 'boolean' },
      sshKeyDeploymentValidated: { type: 'boolean' }
    }
  },
  environment: {
    type: 'object',
    properties: {
      condaEnvironments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            content: { type: 'string' },
            fileName: { type: 'string' }
          }
        }
      }
    }
  },
  deployment: {
    type: 'object',
    properties: {
      enableGitIntegration: { type: 'boolean' },
      sshKeySecretName: { type: 'string' }
    }
  }
} as const

// Default configuration values
const defaultConfig: AppConfig = {
  hardware: {
    cpu: '',
    memory: '',
    gpu: 'none',
    gpuCount: 0,
    pvcs: []
  },
  kubernetes: {
    kubeConfigPath: ''
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

interface ConfigMigration {
  version: string
  migrate: (config: any) => any
}

// Migration system for future config changes
const migrations: ConfigMigration[] = [
  // Example migration
  // {
  //   version: '1.1.0',
  //   migrate: (config: any) => {
  //     // Add new fields or transform existing ones
  //     return config
  //   }
  // }
]

export class ConfigService {
  private store: Store<StoreType>
  private currentVersion = '1.0.0'

  constructor() {
    this.store = new Store<StoreType>({
      defaults: { ...defaultConfig, configVersion: this.currentVersion },
      name: 'jupyter-kube-config',
      cwd: 'userData', // Stores in the user data directory
      fileExtension: 'json',
      clearInvalidConfig: true, // Clear config if validation fails
      serialize: (value: any) => JSON.stringify(value, null, 2),
      deserialize: JSON.parse
    })

    // Run migrations if needed
    this.runMigrations()
  }

  // Get the complete configuration
  getConfig(): AppConfig {
    const storeData = this.store.store
    if (!storeData) return defaultConfig
    // Remove configVersion from the returned data
    const { configVersion, ...config } = storeData
    return { ...defaultConfig, ...config } as AppConfig
  }

  // Save the complete configuration
  setConfig(config: AppConfig): void {
    this.store.store = { ...config, configVersion: this.currentVersion }
  }

  // Get a specific configuration section
  getSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return (this.store as any).get(section, defaultConfig[section])
  }

  // Save a specific configuration section
  setSection<K extends keyof AppConfig>(section: K, value: AppConfig[K]): void {
    this.store.set(section, value)
  }

  // Get a nested configuration value
  getValue<K extends keyof AppConfig, NK extends keyof AppConfig[K]>(
    section: K,
    key: NK
  ): AppConfig[K][NK] {
    const sectionData = this.getSection(section)
    if (!sectionData) return (defaultConfig[section] as any)[key]
    return (sectionData as any)[key]
  }

  // Set a nested configuration value
  setValue<K extends keyof AppConfig, NK extends keyof AppConfig[K]>(
    section: K,
    key: NK,
    value: AppConfig[K][NK]
  ): void {
    const sectionData = this.getSection(section)
    this.setSection(section, { ...sectionData, [key]: value } as AppConfig[K])
  }

  // Reset configuration to defaults
  reset(): void {
    this.store.clear()
  }

  // Reset a specific section
  resetSection<K extends keyof AppConfig>(section: K): void {
    this.setSection(section, defaultConfig[section])
  }

  // Check if configuration exists
  hasConfig(): boolean {
    return this.store.size > 0
  }

  // Get configuration file path (for debugging)
  getConfigPath(): string {
    return this.store.path
  }

  // Export configuration as JSON string
  exportConfig(): string {
    return JSON.stringify(this.getConfig(), null, 2)
  }

  // Import configuration from JSON string
  importConfig(configJson: string): void {
    try {
      const config = JSON.parse(configJson)
      this.setConfig(config)
    } catch (error) {
      throw new Error(`Invalid configuration JSON: ${error}`)
    }
  }

  // Run any needed migrations
  private runMigrations(): void {
    const currentVersion = (this.store as any).get('configVersion', '1.0.0') as string
    
    for (const migration of migrations) {
      if (this.isVersionGreater(migration.version, currentVersion)) {
        logger.info(`Running migration to version ${migration.version}`)
        const config = this.getConfig()
        const migratedConfig = migration.migrate(config)
        this.setConfig(migratedConfig)
      }
    }

    // Update version
    (this.store as any).set('configVersion', this.currentVersion)
  }

  // Simple version comparison
  private isVersionGreater(version1: string, version2: string): boolean {
    const v1Parts = version1.split('.').map(Number)
    const v2Parts = version2.split('.').map(Number)
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0
      const v2Part = v2Parts[i] || 0
      
      if (v1Part > v2Part) return true
      if (v1Part < v2Part) return false
    }
    
    return false
  }

  // Validation helpers
  validateConfig(config: AppConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Hardware validation
    if (!config.hardware.cpu) {
      errors.push('CPU configuration is required')
    }
    if (!config.hardware.memory) {
      errors.push('Memory configuration is required')
    }
    if (config.hardware.gpu !== 'none' && config.hardware.gpuCount <= 0) {
      errors.push('GPU count must be greater than 0 when GPU is selected')
    }

    // Git validation
    if (config.git.enableSSHKeyDeployment && !config.git.sshKeyPath) {
      errors.push('SSH key is required when SSH deployment is enabled')
    }
    if (config.git.email && !config.git.email.includes('@')) {
      errors.push('Git email must be a valid email address')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // Get configuration summary for debugging
  getConfigSummary(): string {
    const config = this.getConfig()
    return `
Configuration Summary:
- Hardware: ${config.hardware.cpu} CPU, ${config.hardware.memory} RAM, ${config.hardware.gpu} GPU
- Kubernetes: ${config.kubernetes.kubeConfigPath ? 'Configured' : 'Not configured'}
- Git: ${config.git.username || 'No username'} <${config.git.email || 'No email'}>
- SSH Key: ${config.git.sshKeyPath ? 'Configured' : 'Not configured'}
- Environments: ${config.environment.condaEnvironments.length} conda environments
- Config Path: ${this.getConfigPath()}
    `.trim()
  }
}

// Export singleton instance
export const configService = new ConfigService() 