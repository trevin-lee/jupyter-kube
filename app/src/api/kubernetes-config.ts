import * as k8s from '@kubernetes/client-node'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface KubernetesConfig {
  kc: k8s.KubeConfig
  coreV1Api: k8s.CoreV1Api
  appsV1Api: k8s.AppsV1Api
  currentContext: string | null
}

export interface KubeConfigLocation {
  path: string
  exists: boolean
  source: 'default' | 'environment' | 'common'
  description: string
}

/**
 * Common kubeconfig file locations to check
 */
const COMMON_KUBECONFIG_PATHS = [
  {
    path: '~/.kube/config',
    source: 'default' as const,
    description: 'Default kubectl config location'
  },
  {
    path: '/etc/kubernetes/admin.conf',
    source: 'common' as const,
    description: 'Common cluster admin config'
  },
  {
    path: '~/.kube/config.yaml',
    source: 'common' as const,
    description: 'Alternative config location'
  }
]

/* Expands ~ to home directory and resolves environment variables*/
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

/**
 * Checks if a kubeconfig file exists at the given path
 */
function checkKubeConfigPath(configPath: string): boolean {
  try {
    const expandedPath = expandPath(configPath)
    return fs.existsSync(expandedPath) && fs.statSync(expandedPath).isFile()
  } catch (error) {
    return false
  }
}

/**
 * Detects kubeconfig files in common locations
 */
export function detectKubeConfigLocations(): KubeConfigLocation[] {
  const locations: KubeConfigLocation[] = []

  // Check KUBECONFIG environment variable first
  const kubeconfigEnv = process.env.KUBECONFIG
  if (kubeconfigEnv) {
    // KUBECONFIG can contain multiple paths separated by colons (Linux/Mac) or semicolons (Windows)
    const separator = process.platform === 'win32' ? ';' : ':'
    const paths = kubeconfigEnv.split(separator)
    
    paths.forEach(envPath => {
      if (envPath.trim()) {
        locations.push({
          path: envPath.trim(),
          exists: checkKubeConfigPath(envPath.trim()),
          source: 'environment',
          description: 'From KUBECONFIG environment variable'
        })
      }
    })
  }

  // Check common locations
  COMMON_KUBECONFIG_PATHS.forEach(location => {
    const exists = checkKubeConfigPath(location.path)
    locations.push({
      path: location.path,
      exists,
      source: location.source,
      description: location.description
    })
  })

  return locations
}

/* Gets the first available kubeconfig file from common locations */
export function getDefaultKubeConfig(): KubeConfigLocation | null {
  const locations = detectKubeConfigLocations()
  return locations.find(location => location.exists) || null
}

/* Loads kubeconfig from a specific file path */
export function loadKubeConfig(configPath: string): KubernetesConfig {
  const kc = new k8s.KubeConfig()
  
  try {
    const expandedPath = expandPath(configPath)
    
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`Kubeconfig file not found at ${expandedPath}`)
    }
    
    kc.loadFromFile(expandedPath)
    
    const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
    const appsV1Api = kc.makeApiClient(k8s.AppsV1Api)
    
    const currentContext = kc.getCurrentContext()
    
    return {
      kc,
      coreV1Api,
      appsV1Api,
      currentContext
    }
  } catch (error) {
    throw new Error(`Failed to load kubeconfig from ${configPath}: ${error}`)
  }
}

/**
 * Loads kubeconfig using the library's default behavior
 */
export function loadDefaultKubeConfig(): KubernetesConfig {
  const kc = new k8s.KubeConfig()
  
  try {
    // Use k8s library's built-in default loading behavior
    kc.loadFromDefault()
    
    // Create API clients
    const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
    const appsV1Api = kc.makeApiClient(k8s.AppsV1Api)
    
    // Get current context
    const currentContext = kc.getCurrentContext()
    
    return {
      kc,
      coreV1Api,
      appsV1Api,
      currentContext
    }
  } catch (error) {
    throw new Error(`Failed to load default kubeconfig: ${error}`)
  }
}

/**
 * Attempts to load kubeconfig from detected locations or throws if none found
 */
export function loadDetectedKubeConfig(): { config: KubernetesConfig; location: KubeConfigLocation } {
  const defaultLocation = getDefaultKubeConfig()
  
  if (!defaultLocation) {
    throw new Error('No kubeconfig file found in common locations. Please provide a kubeconfig file.')
  }
  
  try {
    const config = loadKubeConfig(defaultLocation.path)
    return { config, location: defaultLocation }
  } catch (error) {
    throw new Error(`Found kubeconfig at ${defaultLocation.path} but failed to load: ${error}`)
  }
}

/* Validates that the kubeconfig is working by testing cluster connectivity */
export async function validateKubeConfig(config: KubernetesConfig): Promise<{ valid: boolean; error?: string; clusterInfo?: any }> {
  try {
    // Test connectivity by getting cluster version
    const versionApi = config.kc.makeApiClient(k8s.VersionApi)
    const version = await versionApi.getCode()
    
    return {
      valid: true,
      clusterInfo: {
        version: version,
        context: config.currentContext
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: `Cluster connectivity test failed: ${error}`
    }
  }
}

/**
 * Gets available contexts from a kubeconfig file
 */
export function getAvailableContexts(configPath: string): string[] {
  try {
    const kc = new k8s.KubeConfig()
    const expandedPath = expandPath(configPath)
    kc.loadFromFile(expandedPath)
    
    return kc.getContexts().map(context => context.name)
  } catch (error) {
    throw new Error(`Failed to get contexts from ${configPath}: ${error}`)
  }
}

/* Switches to a different context in the kubeconfig */
export function switchContext(configPath: string, contextName: string): KubernetesConfig {
  const kc = new k8s.KubeConfig()
  
  try {
    const expandedPath = expandPath(configPath)
    kc.loadFromFile(expandedPath)
    kc.setCurrentContext(contextName)
    
    // Create API clients with new context
    const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
    const appsV1Api = kc.makeApiClient(k8s.AppsV1Api)
    
    return {
      kc,
      coreV1Api,
      appsV1Api,
      currentContext: contextName
    }
  } catch (error) {
    throw new Error(`Failed to switch to context ${contextName}: ${error}`)
  }
}

/* Validates a kubeconfig file without loading it fully */
export function validateKubeConfigFile(configPath: string): { valid: boolean; error?: string; contexts?: string[] } {
  try {
    const expandedPath = expandPath(configPath)
    
    if (!fs.existsSync(expandedPath)) {
      return { valid: false, error: 'File does not exist' }
    }
    
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(expandedPath)
    
    const contexts = kc.getContexts().map(context => context.name)
    
    if (contexts.length === 0) {
      return { valid: false, error: 'No contexts found in kubeconfig' }
    }
    
    return { valid: true, contexts }
  } catch (error) {
    return { valid: false, error: `Invalid kubeconfig file: ${error}` }
  }
}
