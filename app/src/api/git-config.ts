import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface GitGlobalConfig {
  username?: string
  email?: string
}

export interface SSHKeyInfo {
  path: string
  type: string
  exists: boolean
  source: 'default' | 'common' | 'custom'
  description: string
  tag?: string // Email or identifier from the key
  content?: string // Key content for deployment
}

export interface GitConfiguration {
  globalConfig: GitGlobalConfig
  sshKeys: SSHKeyInfo[]
  selectedSSHKey?: SSHKeyInfo
  sshKeyContent?: string
}

export interface GitConfigDetectionResult {
  found: boolean
  globalConfig?: GitGlobalConfig
  availableSSHKeys: SSHKeyInfo[]
  defaultSSHKey?: SSHKeyInfo
}

/* Common SSH key file locations to check*/
const COMMON_SSH_KEY_PATHS = [
  {
    path: '~/.ssh/id_rsa',
    type: 'RSA',
    source: 'default' as const,
    description: 'Default RSA SSH key'
  },
  {
    path: '~/.ssh/id_ed25519',
    type: 'ED25519',
    source: 'default' as const,
    description: 'Default ED25519 SSH key'
  },
  {
    path: '~/.ssh/id_ecdsa',
    type: 'ECDSA',
    source: 'default' as const,
    description: 'Default ECDSA SSH key'
  },
  {
    path: '~/.ssh/id_dsa',
    type: 'DSA',
    source: 'default' as const,
    description: 'Default DSA SSH key'
  },
  {
    path: '~/.ssh/github_rsa',
    type: 'RSA',
    source: 'common' as const,
    description: 'GitHub-specific RSA key'
  },
  {
    path: '~/.ssh/gitlab_rsa',
    type: 'RSA',
    source: 'common' as const,
    description: 'GitLab-specific RSA key'
  }
]

/* Expands ~ to home directory and resolves environment variables*/
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

/* Checks if an SSH key file exists at the given path*/
function checkSSHKeyPath(keyPath: string): boolean {
  try {
    const expandedPath = expandPath(keyPath)
    return fs.existsSync(expandedPath) && fs.statSync(expandedPath).isFile()
  } catch (error) {
    return false
  }
}

/* Detects SSH keys in common locations (Node.js/Server-side version)*/
export function detectSSHKeysSync(): SSHKeyInfo[] {
  const sshKeys: SSHKeyInfo[] = []

  COMMON_SSH_KEY_PATHS.forEach(keyInfo => {
    const exists = checkSSHKeyPath(keyInfo.path)
    sshKeys.push({
      path: keyInfo.path,
      type: keyInfo.type,
      exists,
      source: keyInfo.source,
      description: keyInfo.description
    })
  })

  return sshKeys
}

/* Extracts tag/comment from SSH key content (usually email or identifier)*/
export function extractSSHKeyTag(keyContent: string): string {
  try {
    // For public keys, the tag is usually at the end after the key data
    if (keyContent.startsWith('ssh-')) {
      const parts = keyContent.trim().split(' ')
      if (parts.length >= 3) {
        // Format: ssh-rsa AAAAB3... user@example.com
        return parts[2] || 'No identifier'
      }
    }
    
    // For private keys, try to extract from any comment lines
    const lines = keyContent.split('\n')
    for (const line of lines) {
      if (line.startsWith('#') || line.includes('@')) {
        return line.replace('#', '').trim() || 'No identifier'
      }
    }
    
    return 'No identifier'
  } catch (error) {
    return 'Unknown'
  }
}

/* Reads SSH key content and extracts tag information*/
export async function readSSHKeyWithTag(keyPath: string): Promise<{ content: string; tag: string }> {
  try {
    const content = await readSSHKeyElectron(keyPath)
    
    // Try to read corresponding public key for tag
    const publicKeyPath = keyPath.endsWith('.pub') ? keyPath : `${keyPath}.pub`
    let tag = 'No identifier'
    
    try {
      const publicKeyContent = await readSSHKeyElectron(publicKeyPath)
      tag = extractSSHKeyTag(publicKeyContent)
    } catch (error) {
      // If no public key, try to extract from private key comments
      tag = extractSSHKeyTag(content)
    }
    
    return { content, tag }
  } catch (error) {
    throw new Error(`Failed to read SSH key: ${error}`)
  }
}

/* Detects SSH keys using Electron API with tag information (Client-side version)*/
export async function detectSSHKeysElectron(): Promise<SSHKeyInfo[]> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const electronKeys = await window.electronAPI.git.detectSSHKeys()
      const enrichedKeys: SSHKeyInfo[] = []
      
      for (const key of electronKeys) {
        const keyInfo: SSHKeyInfo = {
          path: key.path,
          type: key.type,
          exists: key.exists,
          source: 'default' as const,
          description: `${key.type} SSH key`
        }
        
        // If key exists, try to read it and extract tag
        if (key.exists) {
          try {
            const { content, tag } = await readSSHKeyWithTag(key.path)
            keyInfo.tag = tag
            keyInfo.content = content
          } catch (error) {
            console.log(`Failed to read key ${key.path}:`, error)
            keyInfo.tag = 'Unable to read'
          }
        } else {
          keyInfo.tag = 'Key not found'
        }
        
        enrichedKeys.push(keyInfo)
      }
      
      return enrichedKeys
    } catch (error) {
      console.error('Failed to detect SSH keys via Electron API:', error)
      return []
    }
  }
  return []
}

/* Gets all available SSH keys (not just the first one)*/
export function getAllSSHKeys(sshKeys: SSHKeyInfo[]): SSHKeyInfo[] {
  return sshKeys.filter(key => key.exists)
}

/* Gets the first available SSH key from detected keys*/
export function getDefaultSSHKey(sshKeys: SSHKeyInfo[]): SSHKeyInfo | null {
  return sshKeys.find(key => key.exists) || null
}

/* Reads SSH key content from file path (Node.js/Server-side version)*/
export function readSSHKeySync(keyPath: string): string {
  try {
    const expandedPath = expandPath(keyPath)
    
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`SSH key file not found at ${expandedPath}`)
    }
    
    return fs.readFileSync(expandedPath, 'utf8')
  } catch (error) {
    throw new Error(`Failed to read SSH key from ${keyPath}: ${error}`)
  }
}

/* Reads SSH key content using Electron API (Client-side version)*/
export async function readSSHKeyElectron(keyPath: string): Promise<string> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      return await window.electronAPI.git.readSSHKey(keyPath)
    } catch (error) {
      throw new Error(`Failed to read SSH key from ${keyPath}: ${error}`)
    }
  }
  throw new Error('Electron API not available')
}

/* Gets git global configuration (Node.js/Server-side version)*/
export function getGitGlobalConfigSync(): GitGlobalConfig {
  const globalConfig: GitGlobalConfig = {}
  
  try {
    const { execSync } = require('child_process')
    
    try {
      globalConfig.username = execSync('git config --global user.name', { encoding: 'utf8' }).trim()
    } catch (e) {
      // Username not set globally
    }
    
    try {
      globalConfig.email = execSync('git config --global user.email', { encoding: 'utf8' }).trim()
    } catch (e) {
      // Email not set globally
    }
  } catch (error) {
    console.error('Failed to read git global config:', error)
  }
  
  return globalConfig
}

/* Gets git global configuration using Electron API (Client-side version)*/
export async function getGitGlobalConfigElectron(): Promise<GitGlobalConfig> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      return await window.electronAPI.git.getGlobalConfig()
    } catch (error) {
      console.error('Failed to get git global config via Electron API:', error)
      return {}
    }
  }
  return {}
}

/* Opens SSH key selection dialog using Electron API*/
export async function openSSHKeyDialogElectron(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      return await window.electronAPI.git.openSSHKeyDialog()
    } catch (error) {
      console.error('Failed to open SSH key dialog:', error)
      return null
    }
  }
  return null
}

/* Comprehensive git configuration detection*/
export async function detectGitConfiguration(): Promise<GitConfigDetectionResult> {
  const result: GitConfigDetectionResult = {
    found: false,
    availableSSHKeys: []
  }

  try {
    // Detect global git configuration
    const globalConfig = await getGitGlobalConfigElectron()
    result.globalConfig = globalConfig
    
    // Detect ALL SSH keys with their tags
    const sshKeys = await detectSSHKeysElectron()
    result.availableSSHKeys = sshKeys
    
    // Find default SSH key (first available)
    const defaultSSHKey = getDefaultSSHKey(sshKeys)
    if (defaultSSHKey) {
      result.defaultSSHKey = defaultSSHKey
    }
    
    // Consider configuration "found" if we have either git config or SSH keys
    const hasAvailableKeys = sshKeys.some(key => key.exists)
    result.found = !!(globalConfig.username || globalConfig.email || hasAvailableKeys)
    
  } catch (error) {
    console.error('Git configuration detection failed:', error)
  }

  return result
}

/* Loads complete git configuration with SSH key content*/
export async function loadGitConfiguration(sshKeyPath?: string): Promise<GitConfiguration> {
  const globalConfig = await getGitGlobalConfigElectron()
  const sshKeys = await detectSSHKeysElectron()
  
  const config: GitConfiguration = {
    globalConfig,
    sshKeys
  }
  
  if (sshKeyPath) {
    try {
      const sshKeyContent = await readSSHKeyElectron(sshKeyPath)
      const selectedSSHKey = sshKeys.find(key => key.path === sshKeyPath) || {
        path: sshKeyPath,
        type: 'unknown',
        exists: true,
        source: 'custom' as const,
        description: 'Custom SSH key'
      }
      
      config.selectedSSHKey = selectedSSHKey
      config.sshKeyContent = sshKeyContent
    } catch (error) {
      console.error(`Failed to load SSH key from ${sshKeyPath}:`, error)
    }
  }
  
  return config
}

/* Validates an SSH key file without fully loading it*/
export function validateSSHKeyFile(keyPath: string): { valid: boolean; error?: string; type?: string } {
  try {
    const expandedPath = expandPath(keyPath)
    
    if (!fs.existsSync(expandedPath)) {
      return { valid: false, error: 'SSH key file does not exist' }
    }
    
    const content = fs.readFileSync(expandedPath, 'utf8')
    
    // Basic SSH key format validation
    let type = 'unknown'
    if (content.includes('BEGIN RSA PRIVATE KEY') || content.includes('BEGIN OPENSSH PRIVATE KEY')) {
      type = 'RSA'
    } else if (content.includes('BEGIN ED25519 PRIVATE KEY')) {
      type = 'ED25519'
    } else if (content.includes('BEGIN ECDSA PRIVATE KEY')) {
      type = 'ECDSA'
    } else if (content.includes('BEGIN DSA PRIVATE KEY')) {
      type = 'DSA'
    } else if (content.startsWith('ssh-rsa') || content.startsWith('ssh-ed25519') || content.startsWith('ssh-ecdsa')) {
      // Public key format
      if (content.startsWith('ssh-rsa')) type = 'RSA'
      else if (content.startsWith('ssh-ed25519')) type = 'ED25519'
      else if (content.startsWith('ssh-ecdsa')) type = 'ECDSA'
    } else {
      return { valid: false, error: 'File does not appear to be a valid SSH key' }
    }
    
    return { valid: true, type }
  } catch (error) {
    return { valid: false, error: `Invalid SSH key file: ${error}` }
  }
}

/* Validates git global configuration*/
export function validateGitGlobalConfig(config: GitGlobalConfig): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []
  
  if (!config.username) {
    warnings.push('Git username is not set globally')
  }
  
  if (!config.email) {
    warnings.push('Git email is not set globally')
  }
  
  if (config.email && !config.email.includes('@')) {
    warnings.push('Git email does not appear to be a valid email address')
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  }
}

/* Gets common SSH key locations for display/reference*/
export function getCommonSSHKeyPaths(): string[] {
  return COMMON_SSH_KEY_PATHS.map(key => key.path)
}

/* Determines SSH key type from file path*/
export function getSSHKeyTypeFromPath(keyPath: string): string {
  const lowerPath = keyPath.toLowerCase()
  
  if (lowerPath.includes('ed25519')) return 'ED25519'
  if (lowerPath.includes('rsa')) return 'RSA'
  if (lowerPath.includes('ecdsa')) return 'ECDSA'
  if (lowerPath.includes('dsa')) return 'DSA'
  
  return 'unknown'
}

/* Kubernetes SSH key deployment configuration*/
export interface SSHKeyDeploymentConfig {
  privateKey: string
  publicKey?: string
  knownHosts: string
  keyType: string
  mountPath: string
}

/* Generates known_hosts content for common git services*/
export function generateKnownHosts(): string {
  return `github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
gitlab.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCsj2bNKTBSpIYDEGk9KxsGh3mySTRgMtXL583qmBpzeQ+jqCMRgBqB98u3z++J1sKlXHWfM9dyhSevkMwSbhoR8XIq/U0tCNyokEi/ueaBMCvbcTHhO7k0VCUEQTTnJpHzpNEr7GcF0KhVYE1p1z0k+Y6Y0oBY1qL1i1DAa4VF//YQzQEJ4xK4XpZ6H+L9aYOKqB6Y2a+2aO7e6dL2c2OYJ2LkQ8VsQB7yE1fJXa7rH7f6zV+qj1z7Qg2aYWzI9Y+V2t9g2v+2G2vX2z2q2i+3+1yv1g8vYzj7d8qXk9qB8fzQKp5a8vx`
}

/* Prepares SSH key configuration for Kubernetes deployment*/
export async function prepareSSHKeyForDeployment(
  sshKeyPath: string, 
  sshKeyContent: string
): Promise<SSHKeyDeploymentConfig> {
  const keyType = getSSHKeyTypeFromPath(sshKeyPath)
  
  // Generate corresponding public key path
  const publicKeyPath = sshKeyPath.endsWith('.pub') ? sshKeyPath : `${sshKeyPath}.pub`
  let publicKeyContent = ''
  
  try {
    // Try to read the public key
    publicKeyContent = await readSSHKeyElectron(publicKeyPath)
  } catch (error) {
    console.log('Public key not found, will generate from private key if needed')
  }
  
  return {
    privateKey: sshKeyContent,
    publicKey: publicKeyContent,
    knownHosts: generateKnownHosts(),
    keyType,
    mountPath: '/home/jovyan/.ssh'
  }
}

/* Creates Kubernetes secret manifest for SSH keys*/
export function createSSHKeySecret(
  secretName: string,
  deployConfig: SSHKeyDeploymentConfig
): any {
  const secretData: Record<string, string> = {
    'id_rsa': Buffer.from(deployConfig.privateKey).toString('base64'),
    'known_hosts': Buffer.from(deployConfig.knownHosts).toString('base64')
  }
  
  // Add public key if available
  if (deployConfig.publicKey) {
    secretData['id_rsa.pub'] = Buffer.from(deployConfig.publicKey).toString('base64')
  }
  
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: secretName,
      labels: {
        'app': 'jupyter-lab',
        'component': 'ssh-keys'
      }
    },
    type: 'Opaque',
    data: secretData
  }
}

/* Creates volume mount configuration for SSH keys*/
export function createSSHKeyVolumeMount(secretName: string) {
  return {
    volume: {
      name: 'ssh-keys',
      secret: {
        secretName: secretName,
        defaultMode: 0o600, // Proper permissions for private keys
        items: [
          {
            key: 'id_rsa',
            path: 'id_rsa',
            mode: 0o600
          },
          {
            key: 'id_rsa.pub', 
            path: 'id_rsa.pub',
            mode: 0o644
          },
          {
            key: 'known_hosts',
            path: 'known_hosts',
            mode: 0o644
          }
        ]
      }
    },
    volumeMount: {
      name: 'ssh-keys',
      mountPath: '/home/jovyan/.ssh',
      readOnly: true
    }
  }
}

/* Validates SSH key for container deployment*/
export function validateSSHKeyForDeployment(sshKeyContent: string): {
  valid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []
  
  // Check if it's a private key
  if (!sshKeyContent.includes('BEGIN') || !sshKeyContent.includes('PRIVATE KEY')) {
    errors.push('SSH key appears to be a public key, private key required for git operations')
  }
  
  // Check for password protection
  if (sshKeyContent.includes('Proc-Type: 4,ENCRYPTED')) {
    warnings.push('SSH key is password-protected, you may need to configure ssh-agent in the container')
  }
  
  // Check key strength
  if (sshKeyContent.includes('BEGIN RSA PRIVATE KEY')) {
    warnings.push('RSA key detected, consider using ED25519 for better security')
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors
  }
}

/* Formats SSH key for display in UI*/
export function formatSSHKeyForDisplay(keyInfo: SSHKeyInfo): string {
  const keyName = keyInfo.path.split('/').pop() || keyInfo.path
  const tag = keyInfo.tag || 'No identifier'
  const type = keyInfo.type || 'Unknown'
  
  return `${keyName} (${type}) - ${tag}`
}

/* Creates a short identifier for SSH key*/
export function createSSHKeyShortId(keyInfo: SSHKeyInfo): string {
  const fileName = keyInfo.path.split('/').pop() || 'unknown'
  const tag = keyInfo.tag || 'no-id'
  const shortTag = tag.length > 20 ? `${tag.substring(0, 17)}...` : tag
  
  return `${fileName}: ${shortTag}`
}
