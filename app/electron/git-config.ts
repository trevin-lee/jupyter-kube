import { exec } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from './logging-service'
import { SSHKeyInfo, GitGlobalConfig } from '../src/types/app'

export interface GitConfig {
  globalConfig: GitGlobalConfig
  sshKeys: SSHKeyInfo[]
}

export class GitConfigManager {
  private static instance: GitConfigManager
  private config: GitConfig

  private constructor() {
    this.config = {
      globalConfig: {
        username: '',
        email: ''
      },
      sshKeys: []
    }
  }

  public static getInstance(): GitConfigManager {
    if (!GitConfigManager.instance) {
      GitConfigManager.instance = new GitConfigManager()
    }
    return GitConfigManager.instance
  }

  public getConfig(): GitConfig {
    return this.config
  }

  public setConfig(newConfig: GitConfig): void {
    this.config = newConfig
  }

  public getGlobalConfig(): GitGlobalConfig {
    return this.config.globalConfig
  }

  public setGlobalConfig(username: string, email: string): void {
    this.config.globalConfig = { username, email }
  }

  public getSshKeys(): SSHKeyInfo[] {
    return this.config.sshKeys
  }

  public setSshKeys(keys: SSHKeyInfo[]): void {
    this.config.sshKeys = keys
  }

  public addSshKey(key: SSHKeyInfo): void {
    if (!this.config.sshKeys.find((k) => k.path === key.path)) {
      this.config.sshKeys.push(key)
    }
  }

  public async detectGitConfig(): Promise<GitGlobalConfig> {
    logger.info('Detecting Git global config...')
    try {
      const username = await this.getGitConfigValue('user.name')
      const email = await this.getGitConfigValue('user.email')

      const globalConfig = { username, email }
      this.setGlobalConfig(username, email)
      logger.info('Detected Git config:', globalConfig)
      return globalConfig
    } catch (error) {
      logger.error('Error detecting Git config:', error)
      return { username: '', email: '' }
    }
  }

  private getGitConfigValue(key: string): Promise<string> {
    return new Promise((resolve) => {
      exec(`git config --global ${key}`, (error, stdout) => {
        if (error) {
          logger.warn(`[GitConfigManager] Could not get git config for ${key}:`, error.message)
          resolve('')
        } else {
          resolve(stdout.trim())
        }
      })
    })
  }

  public async detectSSHKeys(): Promise<SSHKeyInfo[]> {
    logger.info('[GitConfigManager] Detecting SSH keys...')
    const sshDir = path.join(os.homedir(), '.ssh')
    const commonKeyFiles = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa']

    const detectedKeys: SSHKeyInfo[] = []

    try {
      const files = await fs.readdir(sshDir)
      for (const file of files) {
        if (
          !file.endsWith('.pub') &&
          commonKeyFiles.some((commonKey) => file.startsWith(commonKey))
        ) {
          const keyPath = path.join(sshDir, file)
          
          // Try to read the public key to extract the tag/comment
          let tag: string | undefined
          try {
            const pubKeyPath = `${keyPath}.pub`
            const pubKeyContent = await fs.readFile(pubKeyPath, 'utf8')
            tag = this.extractSSHKeyTag(pubKeyContent)
          } catch (err) {
            // Public key might not exist or be readable
            logger.debug(`[GitConfigManager] Could not read public key for ${keyPath}`)
          }
          
          detectedKeys.push({ path: keyPath, tag })
        }
      }
      logger.info(`[GitConfigManager] Found ${detectedKeys.length} potential SSH keys in ${sshDir}`)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info(`[GitConfigManager] SSH directory not found at ${sshDir}. No keys detected.`)
      } else {
        logger.error(`[GitConfigManager] Error reading SSH directory: ${sshDir}`, error)
      }
    }

    this.setSshKeys(detectedKeys)
    return this.getSshKeys()
  }

  /**
   * Extract the comment/tag from an SSH key content
   */
  public extractSSHKeyTag(content: string): string {
    if (!content) return 'Unknown'
    
    // SSH public keys have format: ssh-type key comment
    // Example: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH... user@hostname
    const lines = content.trim().split('\n')
    
    // Look for a line that starts with ssh- (public key format)
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.startsWith('ssh-')) {
        // Split by spaces and get everything after the second space as comment
        const parts = trimmedLine.split(/\s+/)
        if (parts.length >= 3) {
          return parts.slice(2).join(' ')
        }
      }
    }
    
    return 'No identifier'
  }
}