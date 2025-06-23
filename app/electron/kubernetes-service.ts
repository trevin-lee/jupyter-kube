import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { KubernetesPortForwardService, PortForwardResult, PortForwardStatus } from './kubernetes-portforward'
import { logger } from './logging-service'

// Use eval to prevent TypeScript from transforming the dynamic import
let k8s: any = null
let k8sLoaded = false

async function loadK8s() {
  if (!k8sLoaded) {
    // Use eval to prevent TypeScript from converting this to require()
    const importExpression = 'import("@kubernetes/client-node")'
    k8s = await eval(importExpression)
    k8sLoaded = true
  }
  return k8s
}

export interface PodStatus {
  name: string
  status: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
  phase: string
  ready: boolean
  restartCount: number
  ip?: string
  startTime?: string
  message?: string
  reason?: string
  conditions?: Array<{
    type: string
    status: string
    message?: string
  }>
}

export interface DeploymentProgress {
  phase: 'initializing' | 'validating-connection' | 'creating-deployment' | 'waiting-for-pod' | 'waiting-for-ready' | 'ready' | 'error'
  progress: number
  message: string
  podName?: string
  podStatus?: PodStatus
  error?: string
}

class KubernetesMainService {
  private kc: any
  private k8sApi: any
  private k8sAppsApi: any
  private k8sAuthApi: any
  private namespace: string = 'default'
  private initialized: boolean = false
  private portForwardService: KubernetesPortForwardService

  constructor() {
    // Initialization will happen on first use
    // Initialize port forwarding service with getPodStatus method bound to this instance
    this.portForwardService = new KubernetesPortForwardService(
      this.namespace,
      (podName: string) => this.getPodStatus(podName)
    )
  }

  private async findSuitableNamespace(): Promise<string> {
    try {
      logger.info('🔍 Finding suitable namespace with permissions...')
      
      // First, check if there's a default namespace set in the kubeconfig context
      const currentContext = this.kc.getCurrentContext()
      if (!currentContext) {
        throw new Error('No current context found')
      }
      
      logger.info('🔍 Current context object:', JSON.stringify(currentContext, null, 2))
      
      // Check if the context has a namespace specified
      let defaultNamespace = ''
      
      // Method 1: Check if currentContext is an object with namespace
      if (typeof currentContext === 'object' && currentContext.namespace) {
        defaultNamespace = currentContext.namespace
        logger.info(`📋 Found default namespace from context object: "${defaultNamespace}"`)
      } else {
        // Method 2: Get namespace from the full context objects array
        const contexts = this.kc.getContexts()
        logger.info('🔍 Available contexts:', contexts.map((ctx: any) => ({ name: ctx.name, namespace: ctx.namespace })))
        
        const contextName = typeof currentContext === 'string' ? currentContext : currentContext?.name
        const activeContext = contexts.find((ctx: any) => ctx.name === contextName)
        
        if (activeContext) {
          logger.info('🔍 Active context details:', { name: activeContext.name, namespace: activeContext.namespace, cluster: activeContext.cluster, user: activeContext.user })
          if (activeContext.namespace) {
            defaultNamespace = activeContext.namespace
            logger.info(`📋 Found default namespace from context details: "${defaultNamespace}"`)
          }
        }
      }
      
      // Method 3: Try to use kubectl to get the current namespace
      if (!defaultNamespace) {
        try {
          logger.info('🔍 Trying to detect namespace from kubectl context...')
          // We could run `kubectl config view --minify -o jsonpath='{..namespace}'` but let's avoid external deps
          // Instead, let's check the raw kubeconfig structure
          const config = this.kc.exportConfig()
          logger.info('🔍 Raw kubeconfig current-context:', config['current-context'])
          
          if (config.contexts) {
            const currentCtx = config.contexts.find((ctx: any) => ctx.name === config['current-context'])
            if (currentCtx && currentCtx.context && currentCtx.context.namespace) {
              defaultNamespace = currentCtx.context.namespace
              logger.info(`📋 Found default namespace from raw kubeconfig: "${defaultNamespace}"`)
            }
          }
        } catch (error) {
          logger.warn('⚠️ Could not extract namespace from raw kubeconfig:', error)
        }
      }
      
      // If we found a default namespace, use it
      if (defaultNamespace) {
        logger.info(`✅ Using default namespace: ${defaultNamespace}`)
        return defaultNamespace
      }
      
      // Extract username from context for fallback user-specific namespace detection
      let username = ''
      let userId = ''
      
      if (typeof currentContext === 'object' && currentContext.user) {
        username = currentContext.user
      } else if (typeof currentContext === 'string') {
        // Context is just a string name
        const users = this.kc.getUsers()
        logger.info('Available users:', users.map((u: any) => ({ name: u.name, user: u.user })))
        if (users.length > 0) {
          username = users[0].name || users[0].user || ''
        }
      }
      
      logger.info(`📋 Extracted username: "${username}"`)
      
      if (!username) {
        logger.warn('⚠️ No username found, will check common namespaces only')
        userId = ''
      } else {
        // Extract user ID from username (handle URLs like "http://cilogon.org/serverE/users/234082")
        if (username.includes('/')) {
          userId = username.split('/').pop() || username
        } else {
          userId = username
        }
      }
      
      logger.info(`📋 Extracted user ID: "${userId}"`)
      
      // List all namespaces first to see what's available
      const namespacesResponse = await this.k8sApi.listNamespace()
      const namespaces = namespacesResponse.body?.items || namespacesResponse.items || []
      const namespaceNames = namespaces.map((ns: any) => ns.metadata?.name).filter(Boolean)
      
      logger.info(`Found ${namespaceNames.length} total namespaces`)
      
      // High priority namespaces to check first (common user namespace patterns)
      const priorityNamespaces = [
        'duarte', // Common user namespace pattern
        '234082', // Based on the user ID from error messages
        `user-234082`,
        `234082-namespace`,
      ].filter(Boolean)
      
      // Add user-specific namespaces based on detected user info
      const userNamespaces = [
        userId, // Last part of username (e.g., from "http://cilogon.org/serverE/users/234082" -> "234082")
        username, // Exact username
        `user-${userId}`, // With user prefix
        `${userId}-namespace`, // With namespace suffix
        `${userId}-ns`, // With ns suffix
        `ns-${userId}`, // With ns prefix
        userId.toLowerCase(), // Lowercase version
        `user-${userId.toLowerCase()}`, // Lowercase with user prefix
      ].filter(Boolean)
      
      // Combine priority and user namespaces, removing duplicates
      const candidateNamespaces = [...new Set([...priorityNamespaces, ...userNamespaces])]
      
      logger.info(`Checking candidate namespaces: ${candidateNamespaces.join(', ')}`)
      
      // Check if any candidate namespaces exist
      for (const candidateNs of candidateNamespaces) {
        if (namespaceNames.includes(candidateNs)) {
          logger.info(`✅ Found and using namespace: ${candidateNs}`)
          return candidateNs
        } else {
          logger.warn(`⚠️ Namespace ${candidateNs} not found in cluster`)
        }
      }
      
      // Last resort: try some common namespace patterns
      const lastResortPatterns = ['default', 'kube-public', 'jupyter', 'jupyter-lab', 'notebook', 'lab']
      logger.info(`🔍 Trying last resort namespace patterns: ${lastResortPatterns.join(', ')}`)
      
      for (const pattern of lastResortPatterns) {
        if (namespaceNames.includes(pattern)) {
          logger.info(`✅ Using last resort namespace: ${pattern}`)
          return pattern
        }
      }
      
      // If we still haven't found a suitable namespace, provide a helpful error
      logger.warn('📋 Available namespaces for reference:', namespaceNames.slice(0, 20).join(', '))
      throw new Error(`No suitable namespace found. Available namespaces: ${namespaceNames.slice(0, 10).join(', ')}... Please specify a namespace manually or contact your cluster administrator.`)
      
    } catch (error) {
      logger.error('Error finding suitable namespace:', error)
      throw error
    }
  }

  private async initialize() {
    if (!this.initialized) {
      const k8sModule = await loadK8s()
      this.kc = new k8sModule.KubeConfig()
      
      // Load default kubeconfig to check it first
      this.kc.loadFromDefault()
      
      // Debug: Log kubeconfig info BEFORE creating API clients
      const contexts = this.kc.getContexts()
      const currentContext = this.kc.getCurrentContext()
      const clusters = this.kc.getClusters()
      const users = this.kc.getUsers()
      
      logger.info('=== KUBECONFIG DEBUG (initialize) ===')
      logger.info('- Current context:', currentContext)
      logger.info('- Available contexts:', contexts.map((c: any) => c.name))
      logger.info('- Available clusters:', clusters.map((c: any) => c.name))
      logger.info('- Available users:', users.map((u: any) => u.name))
      
      if (!currentContext) {
        throw new Error('No current context set in kubeconfig during initialization')
      }
      
      if (contexts.length === 0) {
        throw new Error('No contexts found in kubeconfig during initialization')
      }
      
      if (clusters.length === 0) {
        throw new Error('No clusters found in kubeconfig during initialization')
      }
      
      logger.info('Creating API clients...')
      this.k8sApi = this.kc.makeApiClient(k8sModule.CoreV1Api)
      this.k8sAppsApi = this.kc.makeApiClient(k8sModule.AppsV1Api)
      this.k8sAuthApi = this.kc.makeApiClient(k8sModule.AuthorizationV1Api)
      logger.info('✅ API clients created successfully')
      
      this.initialized = true
    }
  }

  private async ensureNamespaceSet(): Promise<void> {
    await this.initialize()
    
    // If we're still using the default namespace, try to find a better one
    if (this.namespace === 'default') {
      logger.info('🔍 Default namespace detected, finding suitable namespace...')
      try {
        this.namespace = await this.findSuitableNamespace()
        logger.info(`✅ Using namespace: ${this.namespace}`)
      } catch (error) {
        logger.warn('⚠️ Could not find suitable namespace, will use default:', error)
        // Keep using default and let the actual operations fail with helpful error messages
        // This way users get specific permission errors rather than generic failures
      }
    }
    
    // Update port forwarding service with current namespace
    this.portForwardService.updateNamespace(this.namespace)
    
    logger.info(`📋 Final namespace selection: ${this.namespace}`)
  }

  private expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1))
    }
    return filePath
  }

  async validateConnection(kubeConfigPath: string): Promise<boolean> {
    try {
      await this.initialize()
      
      const expandedPath = this.expandPath(kubeConfigPath)
      if (!fs.existsSync(expandedPath)) {
        throw new Error(`Kubeconfig file not found at ${expandedPath}`)
      }

      logger.info(`Loading kubeconfig from: ${expandedPath}`)
      this.kc.loadFromFile(expandedPath)
      
      // Debug: Log kubeconfig info AFTER loading from file
      const contexts = this.kc.getContexts()
      const currentContext = this.kc.getCurrentContext()
      const clusters = this.kc.getClusters()
      const users = this.kc.getUsers()
      
      logger.info('=== KUBECONFIG DEBUG (after file load) ===')
      logger.info('- Current context:', currentContext)
      logger.info('- Available contexts:', contexts.map((c: any) => c.name))
      logger.info('- Available clusters:', clusters.map((c: any) => c.name))
      logger.info('- Available users:', users.map((u: any) => u.name))
      
      if (!currentContext) {
        throw new Error('No current context set in kubeconfig. Please set a current context with: kubectl config use-context <context-name>')
      }
      
      if (contexts.length === 0) {
        throw new Error('No contexts found in kubeconfig file')
      }
      
      if (clusters.length === 0) {
        throw new Error('No clusters found in kubeconfig file')
      }

      const k8sModule = await loadK8s()
      logger.info('Recreating API clients with loaded config...')
      this.k8sApi = this.kc.makeApiClient(k8sModule.CoreV1Api)
      this.k8sAppsApi = this.kc.makeApiClient(k8sModule.AppsV1Api)
      this.k8sAuthApi = this.kc.makeApiClient(k8sModule.AuthorizationV1Api)
      logger.info('✅ API clients recreated successfully')

      logger.info('Testing connection to cluster...')
      // Test connection by listing namespaces
      const namespaces = await this.k8sApi.listNamespace()
      logger.info('Raw namespaces response:', namespaces)
      
      // Handle different response structures
      let namespaceCount = 0
      if (namespaces && namespaces.body && namespaces.body.items) {
        namespaceCount = namespaces.body.items.length
      } else if (namespaces && namespaces.items) {
        namespaceCount = namespaces.items.length
      } else if (Array.isArray(namespaces)) {
        namespaceCount = namespaces.length
      } else {
        logger.warn('Unexpected response structure, but connection successful')
        namespaceCount = 0
      }
      
      logger.info(`✅ Successfully connected! Found ${namespaceCount} namespaces`)
      
      // Find a suitable namespace for deployments
      logger.info('🔍 Finding suitable namespace...')
      try {
        this.namespace = await this.findSuitableNamespace()
        logger.info(`✅ Using namespace: ${this.namespace}`)
      } catch (error) {
        logger.warn('⚠️ Could not find suitable namespace during validation, will use default:', error)
        // Don't fail validation just because we can't find a namespace yet
        this.namespace = 'default'
      }
      
      return true
    } catch (error) {
      logger.error('Kubernetes connection validation failed:', error)
      
      // Provide more helpful error messages
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('No active cluster')) {
        throw new Error('No active cluster configured in kubeconfig. Please ensure your kubeconfig has a valid current-context set. Run: kubectl config current-context')
      } else if (errorMessage.includes('Unable to connect')) {
        throw new Error('Unable to connect to cluster. Please check your network connection and cluster status.')
      } else if (errorMessage.includes('Unauthorized')) {
        throw new Error('Authentication failed. Please check your credentials or run: kubectl auth can-i get pods')
      } else if (errorMessage.includes('certificate')) {
        throw new Error('SSL certificate error. Your cluster certificates may be expired or invalid.')
      }
      
      throw error
    }
  }

  async deploySecrets(config: any): Promise<void> {
    await this.ensureNamespaceSet()
    
    // Use the namespace from config if provided, otherwise use detected/default
    if (config.kubernetes?.namespace) {
      this.namespace = config.kubernetes.namespace
      logger.info(`🎯 Using configured namespace: ${this.namespace}`)
    }
    
    logger.info(`🔐 Attempting to deploy secrets to namespace: ${this.namespace}`)
    
    const secrets = []

    // Deploy SSH key secret if enabled
    if (config.git?.enableSSHKeyDeployment && config.git?.sshKeyContent) {
      const sshSecret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'jupyter-ssh-key',
          namespace: this.namespace,
          labels: {
            'app': 'jupyter-kube',
            'component': 'ssh-key'
          }
        },
        type: 'Opaque',
        data: {
          'id_rsa': Buffer.from(config.git.sshKeyContent).toString('base64')
        }
      }
      secrets.push(sshSecret)
      logger.info(`📋 Prepared SSH key secret for namespace: ${this.namespace}`)
    }

    // Deploy Git credentials secret
    if (config.git?.username && config.git?.email) {
      const gitSecret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'jupyter-git-config',
          namespace: this.namespace,
          labels: {
            'app': 'jupyter-kube',
            'component': 'git-config'
          }
        },
        type: 'Opaque',
        data: {
          'username': Buffer.from(config.git.username).toString('base64'),
          'email': Buffer.from(config.git.email).toString('base64')
        }
      }
      secrets.push(gitSecret)
      logger.info(`📋 Prepared Git credentials secret for namespace: ${this.namespace}`)
    }

    if (secrets.length === 0) {
      logger.info('ℹ️ No secrets to deploy')
      return
    }

    // Deploy all secrets
    for (const secret of secrets) {
      try {
        logger.info(`🚀 Creating secret ${secret.metadata?.name} in namespace ${this.namespace}`)
        await this.k8sApi.createNamespacedSecret({
          namespace: this.namespace,
          body: secret
        })
        logger.info(`✅ Created secret: ${secret.metadata?.name}`)
      } catch (error: any) {
        logger.error(`🔍 Error details for secret ${secret.metadata?.name}:`, {
          message: error.message,
          response: error.response,
          statusCode: error.response?.status,
          body: error.body
        })
        
        // Check for 409 "Already Exists" error in multiple ways
        const is409Error = (
          error.response?.status === 409 ||
          error.statusCode === 409 ||
          error.message?.includes('HTTP-Code: 409') ||
          error.message?.includes('already exists') ||
          (error.body && typeof error.body === 'string' && error.body.includes('AlreadyExists')) ||
          (error.body && typeof error.body === 'object' && error.body.reason === 'AlreadyExists')
        )
        
        if (is409Error) {
          logger.info(`🔄 Secret ${secret.metadata?.name} already exists, updating...`)
          try {
            await this.k8sApi.replaceNamespacedSecret({
              name: secret.metadata!.name!,
              namespace: this.namespace,
              body: secret
            })
            logger.info(`✅ Updated existing secret: ${secret.metadata?.name}`)
          } catch (updateError: any) {
            logger.error(`❌ Failed to update existing secret ${secret.metadata?.name}:`, updateError)
            throw new Error(`Failed to update existing secret "${secret.metadata?.name}": ${updateError.message}`)
          }
        } else {
          logger.error(`❌ Failed to deploy secret ${secret.metadata?.name}:`, error)
          const is403Error = (
            error.response?.status === 403 ||
            error.statusCode === 403 ||
            error.message?.includes('HTTP-Code: 403') ||
            error.message?.includes('Permission denied') ||
            error.message?.includes('Forbidden')
          )
          
          if (is403Error) {
            throw new Error(`Permission denied creating secret "${secret.metadata?.name}" in namespace "${this.namespace}". Please check your RBAC permissions.`)
          }
          throw error
        }
      }
    }
    logger.info(`✅ Successfully deployed ${secrets.length} secret(s) to namespace: ${this.namespace}`)
  }

  private getGpuResourceKey(gpuType: string): string {
    switch (gpuType) {
      case 'a40': return 'nvidia.com/a40'
      case 'a100': return 'nvidia.com/a100'
      case 'rtxa6000': return 'nvidia.com/rtxa6000'
      case 'rtx8000': return 'nvidia.com/rtx8000'
      case 'gh200': return 'nvidia.com/gh200'
      case 'mig-small': return 'nvidia.com/mig-1g.5gb'
      case 'any-gpu': return 'nvidia.com/gpu'
      default: return 'nvidia.com/gpu'
    }
  }

  private generateKubeconfigHash(kubeconfigPath: string): string {
    try {
      const crypto = require('crypto')
      const fs = require('fs')
      
      // Expand the path
      const expandedPath = this.expandPath(kubeconfigPath)
      
      // Read the kubeconfig file content
      const kubeconfigContent = fs.readFileSync(expandedPath, 'utf8')
      
      // Generate SHA256 hash and take first 10 characters
      const hash = crypto.createHash('sha256')
        .update(kubeconfigContent)
        .digest('hex')
        .substring(0, 10)
      
      logger.info(`🔐 Generated kubeconfig hash from ${expandedPath}: ${hash}`)
      return hash
    } catch (error: any) {
      logger.warn(`⚠️ Failed to generate kubeconfig hash: ${error.message}`)
      // Fallback to timestamp-based hash
      const crypto = require('crypto')
      const fallbackContent = `${kubeconfigPath}-${Date.now()}`
      const fallbackHash = crypto.createHash('sha256')
        .update(fallbackContent)
        .digest('hex')
        .substring(0, 10)
      
      logger.info(`🔐 Using fallback hash: ${fallbackHash}`)
      return fallbackHash
    }
  }

  private generatePodName(config: any): string {
    // Use kubeconfig hash as the unique identifier
    const kubeconfigPath = config.kubernetes?.kubeConfigPath || '~/.kube/config'
    const hash = this.generateKubeconfigHash(kubeconfigPath)
    
    // Create pod name with hash
    const podName = `jupyter-kube-${hash}`
    
    logger.info(`🏷️ Generated pod name from kubeconfig hash: "${podName}"`)
    return podName
  }

  private normalizeResourceQuantity(value: string, resourceType: 'cpu' | 'memory'): string {
    if (!value) {
      throw new Error(`${resourceType} value is required`)
    }

    const trimmedValue = value.trim()
    
    if (resourceType === 'cpu') {
      // CPU can be: "1", "1.5", "1000m", etc.
      // Just validate it matches the pattern
      const cpuPattern = /^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$/
      if (cpuPattern.test(trimmedValue)) {
        return trimmedValue
      } else {
        throw new Error(`Invalid CPU format: "${trimmedValue}". Expected format like "1", "1.5", or "1000m"`)
      }
    } else if (resourceType === 'memory') {
      // Memory normalization: convert common formats to Kubernetes format
      const memoryPattern = /^([+-]?[0-9.]+)\s*(Gb|GB|gb|Gi|GiB|Mb|MB|mb|Mi|MiB|Kb|KB|kb|Ki|KiB|Ti|TiB|tb|TB|Pi|PiB|pb|PB|Ei|EiB|eb|EB)?$/i
      const match = trimmedValue.match(memoryPattern)
      
      if (!match) {
        throw new Error(`Invalid memory format: "${trimmedValue}". Expected format like "12Gi", "1024Mi", or "12Gb"`)
      }
      
      const [, amount, unit = ''] = match
      
      // Convert common user formats to Kubernetes formats
      const normalizedUnit = unit.toLowerCase()
      switch (normalizedUnit) {
        case '':
          // No unit, assume bytes
          return `${amount}`
        case 'gb':
        case 'g':
          // Convert GB to Gi (user probably means gibibytes)
          return `${amount}Gi`
        case 'gi':
        case 'gib':
          return `${amount}Gi`
        case 'mb':
        case 'm':
          // Convert MB to Mi (user probably means mebibytes) 
          return `${amount}Mi`
        case 'mi':
        case 'mib':
          return `${amount}Mi`
        case 'kb':
        case 'k':
          return `${amount}Ki`
        case 'ki':
        case 'kib':
          return `${amount}Ki`
        case 'tb':
        case 't':
          return `${amount}Ti`
        case 'ti':
        case 'tib':
          return `${amount}Ti`
        case 'pb':
        case 'p':
          return `${amount}Pi`
        case 'pi':
        case 'pib':
          return `${amount}Pi`
        case 'eb':
        case 'e':
          return `${amount}Ei`
        case 'ei':
        case 'eib':
          return `${amount}Ei`
        default:
          // Return as-is and let Kubernetes validate
          return trimmedValue
      }
    }
    
    return trimmedValue
  }

  async createJupyterLabPod(config: any): Promise<string> {
    await this.ensureNamespaceSet()
    
    // Use the namespace from config if provided, otherwise use detected/default
    if (config.kubernetes?.namespace) {
      this.namespace = config.kubernetes.namespace
      logger.info(`🎯 Using configured namespace: ${this.namespace}`)
    }
    
    const podName = this.generatePodName(config)
    logger.info(`🚀 Creating JupyterLab deployment "${podName}" in namespace: ${this.namespace}`)
    
    // Check if deployment already exists and handle appropriately
    try {
      logger.info(`🔍 Checking if deployment "${podName}" already exists...`)
      const existingDeployment = await this.k8sAppsApi.readNamespacedDeployment({
        name: podName,
        namespace: this.namespace
      })
      
      if (existingDeployment) {
        const replicas = existingDeployment.body?.spec?.replicas || existingDeployment.spec?.replicas || 0
        const readyReplicas = existingDeployment.body?.status?.readyReplicas || existingDeployment.status?.readyReplicas || 0
        const availableReplicas = existingDeployment.body?.status?.availableReplicas || existingDeployment.status?.availableReplicas || 0
        
        logger.info(`📋 Found existing deployment "${podName}" with replicas: ${replicas}, ready: ${readyReplicas}, available: ${availableReplicas}`)
        
        // Get more detailed deployment information for better decision making
        const deletionTimestamp = existingDeployment.body?.metadata?.deletionTimestamp || existingDeployment.metadata?.deletionTimestamp
        const deploymentConditions = existingDeployment.body?.status?.conditions || existingDeployment.status?.conditions || []
        
        // Log detailed state for debugging
        logger.info(`🔍 Deployment "${podName}" detailed state:`, {
          replicas,
          readyReplicas,
          availableReplicas,
          deletionTimestamp: deletionTimestamp ? 'SET' : 'NOT_SET',
          conditionsCount: deploymentConditions.length
        })
        
        // For reconnection scenarios, prioritize using healthy running deployments
        const isHealthyRunningDeployment = readyReplicas > 0 && availableReplicas > 0 && !deletionTimestamp
        const isDeploymentStarting = replicas > 0 && !deletionTimestamp && readyReplicas === 0
        const isUsableDeployment = isHealthyRunningDeployment || isDeploymentStarting
        
        if (isHealthyRunningDeployment) {
          // This is a healthy running deployment - use it immediately for fast reconnection
          logger.info(`🚀 Found healthy running deployment "${podName}" - using for fast reconnection`)
          const error = new Error(`EXISTING_POD_FOUND:${podName}`)
          error.name = 'ExistingPodFound'
          throw error
        }
        
        if (deletionTimestamp) {
          logger.info(`⏳ Deployment "${podName}" has deletionTimestamp set, waiting for removal before creating new one`)
          // Wait a bit for the deployment to be fully deleted, then continue with creation
          await new Promise(resolve => setTimeout(resolve, 3000))
          // Re-check if deployment still exists after waiting
          try {
            const recheckDeployment = await this.k8sAppsApi.readNamespacedDeployment({
              name: podName,
              namespace: this.namespace
            })
            if (recheckDeployment) {
              logger.warn(`⚠️ Deployment "${podName}" still exists after waiting, it may be stuck in terminating state`)
              throw new Error(`Deployment "${podName}" is stuck in terminating state. Please delete it manually with: kubectl delete deployment ${podName} -n ${this.namespace}`)
            }
          } catch (recheckError: any) {
            if (recheckError.code === 404 || recheckError.response?.status === 404) {
              logger.info(`✅ Deployment "${podName}" has been successfully deleted, proceeding with creation`)
            } else {
              throw recheckError
            }
          }
        } else if (isDeploymentStarting) {
          // Deployment is starting - can be reused
          logger.info(`🎯 Found starting deployment "${podName}" - redirecting to it`)
          const error = new Error(`EXISTING_POD_FOUND:${podName}`)
          error.name = 'ExistingPodFound'
          throw error
        } else if (!isUsableDeployment) {
          // Deployment is in a bad state - delete it
          logger.info(`⚠️ Deployment "${podName}" is in unusable state (ready: ${readyReplicas}/${replicas}), cleaning it up`)
          try {
            await this.k8sAppsApi.deleteNamespacedDeployment({
              name: podName,
              namespace: this.namespace
            })
            logger.info(`🗑️ Deleted unusable deployment "${podName}", proceeding with new creation`)
            // Wait for deployment to be fully deleted
            await new Promise(resolve => setTimeout(resolve, 5000))
          } catch (deleteError: any) {
            logger.warn(`⚠️ Failed to delete unusable deployment "${podName}":`, deleteError.message)
          }
        } else {
          // Default case - deployment seems usable, try to redirect to it
          logger.info(`🎯 Using existing deployment "${podName}" (ready: ${readyReplicas}/${replicas}) instead of creating new one`)
          const error = new Error(`EXISTING_POD_FOUND:${podName}`)
          error.name = 'ExistingPodFound'
          throw error
        }
      }
    } catch (checkError: any) {
      if (checkError.name === 'ExistingPodFound') {
        // Re-throw this special error to be handled by the caller
        throw checkError
      } else if (checkError.code === 404 || checkError.response?.status === 404 || checkError.message?.includes('HTTP-Code: 404')) {
        // Deployment doesn't exist, which is what we want for creating a new one
        logger.info(`✅ Deployment "${podName}" does not exist, proceeding with creation`)
      } else {
        logger.error(`❌ Error checking for existing deployment:`, checkError)
        throw new Error(`Unable to check for existing deployment "${podName}": ${checkError.message}`)
      }
    }
    
    // Build environment variables
    const envVars: any[] = []
    
    if (config.git?.username) {
      envVars.push({ name: 'GIT_USER_NAME', value: config.git.username })
    }
    if (config.git?.email) {
      envVars.push({ name: 'GIT_USER_EMAIL', value: config.git.email })
    }
    if (config.git?.enableSSHKeyDeployment) {
      envVars.push({ name: 'SETUP_SSH_KEY', value: 'true' })
    }
    if (config.environment?.condaEnvironments?.length > 0) {
      envVars.push({ 
        name: 'CONDA_ENVIRONMENTS', 
        value: JSON.stringify(config.environment.condaEnvironments) 
      })
    }

    // Build volume mounts
    const volumeMounts: any[] = []
    const volumes: any[] = []

    // Add PVC mounts
    if (config.hardware?.pvcs?.length > 0) {
      config.hardware.pvcs.forEach((pvc: any, index: number) => {
        // Ensure PVCs are mounted under /home/jovyan/main/
        // Remove leading slash if present and prepend the base path
        const cleanPath = pvc.mountPath.replace(/^\/+/, '')
        const fullMountPath = `/home/jovyan/main/${cleanPath}`
        
        volumeMounts.push({
          name: `pvc-${index}`,
          mountPath: fullMountPath
        })
        volumes.push({
          name: `pvc-${index}`,
          persistentVolumeClaim: {
            claimName: pvc.name
          }
        })
      })
    }

    // Add SSH key volume if enabled
    if (config.git?.enableSSHKeyDeployment) {
      volumeMounts.push({
        name: 'ssh-key',
        mountPath: '/home/jovyan/.ssh',
        readOnly: true
      })
      volumes.push({
        name: 'ssh-key',
        secret: {
          secretName: 'jupyter-ssh-key',
          defaultMode: 0o600
        }
      })
    }

    // Build resource requirements
    logger.info(`🔍 Raw resource config from user:`, {
      cpu: config.hardware.cpu,
      memory: config.hardware.memory,
      gpu: config.hardware.gpu,
      gpuCount: config.hardware.gpuCount
    })
    
    // Normalize resource quantities to Kubernetes format
    let normalizedCpu: string
    let normalizedMemory: string
    
    try {
      normalizedCpu = this.normalizeResourceQuantity(config.hardware.cpu, 'cpu')
      normalizedMemory = this.normalizeResourceQuantity(config.hardware.memory, 'memory')
      
      logger.info(`✅ Normalized resources:`, {
        cpu: `"${config.hardware.cpu}" -> "${normalizedCpu}"`,
        memory: `"${config.hardware.memory}" -> "${normalizedMemory}"`
      })
    } catch (error) {
      logger.error(`❌ Resource normalization failed:`, error)
      throw new Error(`Invalid resource configuration: ${error}`)
    }
    
    const resources: any = {
      requests: {
        'cpu': normalizedCpu,
        'memory': normalizedMemory
      },
      limits: {
        'cpu': normalizedCpu,
        'memory': normalizedMemory
      }
    }

    // Add GPU resources if specified
    if (config.hardware.gpu !== 'none' && config.hardware.gpuCount > 0) {
      const gpuResourceKey = this.getGpuResourceKey(config.hardware.gpu)
      resources.requests[gpuResourceKey] = config.hardware.gpuCount.toString()
      resources.limits[gpuResourceKey] = config.hardware.gpuCount.toString()
    }

    const deploymentSpec = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: podName,
        namespace: this.namespace,
        labels: {
          'app': 'jupyter-kube',
          'component': 'jupyterlab'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            'app': 'jupyter-kube',
            'component': 'jupyterlab',
            'instance': podName
          }
        },
        template: {
          metadata: {
            labels: {
              'app': 'jupyter-kube',
              'component': 'jupyterlab',
              'instance': podName
            }
          },
          spec: {
            containers: [{
              name: 'jupyterlab',
              image: 'gitlab-registry.nrp-nautilus.io/trevin/jupyter-kube/jupyter:latest',
              ports: [{
                containerPort: 8888,
                name: 'jupyter'
              }],
              env: envVars,
              volumeMounts,
              resources,
              imagePullPolicy: 'Always'
            }],
            volumes,
            restartPolicy: 'Always'
          }
        }
      }
    }

    logger.info(`🔍 Final deployment specification:`, JSON.stringify(deploymentSpec, null, 2))

    try {
      await this.k8sAppsApi.createNamespacedDeployment({
        namespace: this.namespace,
        body: deploymentSpec
      })
      logger.info(`✅ Created deployment: ${podName} in namespace: ${this.namespace}`)
      return podName
    } catch (error: any) {
      logger.error(`❌ Failed to create deployment in namespace ${this.namespace}:`, {
        message: error.message,
        response: error.response,
        statusCode: error.response?.status,
        body: error.body
      })
      
      // Provide more helpful error messages for common issues
      if (error.message?.includes('quantities must match the regular expression')) {
        throw new Error(`Invalid resource quantities in deployment specification. Please check CPU and memory values. Original error: ${error.message}`)
      } else if (error.message?.includes('HTTP-Code: 400')) {
        throw new Error(`Bad request when creating deployment. Please check your configuration. Original error: ${error.message}`)
      } else if (error.message?.includes('HTTP-Code: 409') || error.message?.includes('AlreadyExists')) {
        // This should be very rare now that we redirect to existing deployments
        throw new Error(`A JupyterLab deployment with name "${podName}" was created by another process during deployment. Please refresh and try again.`)
      }
      
      throw error
    }
  }

  async getPodStatus(podName: string): Promise<PodStatus> {
    try {
      await this.ensureNamespaceSet()
      
      // With deployments, we need to find the pod created by the deployment
      // First, list pods with the deployment's selector labels
      const podList = await this.k8sApi.listNamespacedPod({
        namespace: this.namespace,
        labelSelector: `app=jupyter-kube,component=jupyterlab,instance=${podName}`
      })
      
      const pods = podList.body?.items || podList.items || []
      
      if (pods.length === 0) {
        // No pods found - deployment may not have created pod yet
        return {
          name: podName,
          status: 'Pending',
          phase: 'Pending',
          ready: false,
          restartCount: 0,
          message: 'No pods found for deployment',
          reason: 'NoPods'
        }
      }
      
      // Use the first (and should be only) pod
      const pod = pods[0]

      const phase = pod.status?.phase || 'Unknown'
      const conditions = pod.status?.conditions || []
      const containerStatuses = pod.status?.containerStatuses || []

      // Check if all containers are ready
      const ready = containerStatuses.length > 0 && 
                   containerStatuses.every((status: any) => status.ready === true)

      // Calculate restart count
      const restartCount = containerStatuses.reduce((total: number, status: any) => total + (status.restartCount || 0), 0)

      // Map phase to status
      const mapPhaseToStatus = (phase: string): 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown' => {
        switch (phase.toLowerCase()) {
          case 'pending': return 'Pending'
          case 'running': return 'Running'
          case 'succeeded': return 'Succeeded'
          case 'failed': return 'Failed'
          default: return 'Unknown'
        }
      }

      // Get the most relevant message
      let message = ''
      let reason = ''

      if (phase === 'Pending') {
        const containerStatus = containerStatuses[0]
        if (containerStatus?.state?.waiting) {
          reason = containerStatus.state.waiting.reason || 'Waiting'
          message = containerStatus.state.waiting.message || 'Container is waiting to start'
        } else {
          message = 'Pod is pending'
        }
      } else if (phase === 'Running') {
        message = ready ? 'Pod is running and ready' : 'Pod is running but not ready'
      } else if (phase === 'Failed') {
        const containerStatus = containerStatuses[0]
        if (containerStatus?.state?.terminated) {
          reason = containerStatus.state.terminated.reason || 'Failed'
          message = containerStatus.state.terminated.message || 'Container failed'
        } else {
          message = 'Pod failed'
        }
      }

      return {
        name: podName,
        status: mapPhaseToStatus(phase),
        phase,
        ready,
        restartCount,
        ip: pod.status?.podIP,
        startTime: pod.status?.startTime?.toISOString(),
        message,
        reason,
        conditions: conditions.map((condition: any) => ({
          type: condition.type,
          status: condition.status,
          message: condition.message
        }))
      }
    } catch (error) {
      logger.error('Failed to get pod status:', error)
      throw error
    }
  }

  async waitForPodReady(podName: string, timeoutMs: number = 300000): Promise<PodStatus> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getPodStatus(podName)
        
        if (status.phase === 'Failed') {
          throw new Error(`Pod failed: ${status.message}`)
        }
        
        if (status.phase === 'Running' && status.ready) {
          return status
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        logger.error('Error checking pod status:', error)
        throw error
      }
    }
    
    throw new Error(`Pod did not become ready within ${timeoutMs / 1000} seconds`)
  }

  async listAvailableNamespaces(): Promise<string[]> {
    try {
      await this.initialize()
      
      const namespacesResponse = await this.k8sApi.listNamespace()
      const namespaces = namespacesResponse.body?.items || namespacesResponse.items || []
      const namespaceNames = namespaces.map((ns: any) => ns.metadata?.name).filter(Boolean)
      
      logger.info(`📋 Available namespaces: ${namespaceNames.join(', ')}`)
      return namespaceNames
      
    } catch (error) {
      logger.error('Failed to list namespaces:', error)
      return []
    }
  }

  async detectDefaultNamespace(): Promise<{ defaultNamespace: string | null, availableNamespaces: string[] }> {
    try {
      await this.initialize()
      
      logger.info('🔍 Detecting default namespace from kubeconfig...')
      
      // Method 1: Check if currentContext is an object with namespace
      const currentContext = this.kc.getCurrentContext()
      let defaultNamespace = ''
      
      if (typeof currentContext === 'object' && currentContext.namespace) {
        defaultNamespace = currentContext.namespace
        logger.info(`📋 Found default namespace from context object: "${defaultNamespace}"`)
      } else {
        // Method 2: Get namespace from the full context objects array
        const contexts = this.kc.getContexts()
        logger.info('🔍 Available contexts:', contexts.map((ctx: any) => ({ name: ctx.name, namespace: ctx.namespace })))
        
        const contextName = typeof currentContext === 'string' ? currentContext : currentContext?.name
        const activeContext = contexts.find((ctx: any) => ctx.name === contextName)
        
        if (activeContext && activeContext.namespace) {
          defaultNamespace = activeContext.namespace
          logger.info(`📋 Found default namespace from context details: "${defaultNamespace}"`)
        }
      }
      
      // Method 3: Try to use raw kubeconfig
      if (!defaultNamespace) {
        try {
          const config = this.kc.exportConfig()
          if (config.contexts) {
            const currentCtx = config.contexts.find((ctx: any) => ctx.name === config['current-context'])
            if (currentCtx && currentCtx.context && currentCtx.context.namespace) {
              defaultNamespace = currentCtx.context.namespace
              logger.info(`📋 Found default namespace from raw kubeconfig: "${defaultNamespace}"`)
            }
          }
        } catch (error) {
          logger.warn('⚠️ Could not extract namespace from raw kubeconfig:', error)
        }
      }
      
      // Get list of available namespaces
      const availableNamespaces = await this.listAvailableNamespaces()
      
      return {
        defaultNamespace: defaultNamespace || null,
        availableNamespaces
      }
      
    } catch (error) {
      logger.error('Failed to detect default namespace:', error)
      return {
        defaultNamespace: null,
        availableNamespaces: []
      }
    }
  }

  async validateNamespace(namespace: string): Promise<{ 
    exists: boolean,
    error?: string 
  }> {
    try {
      await this.initialize()
      
      logger.info(`🔍 Validating namespace: ${namespace}`)
      
      // Check if namespace exists
      const namespaces = await this.listAvailableNamespaces()
      const exists = namespaces.includes(namespace)
      
      if (!exists) {
        return {
          exists: false,
          error: `Namespace "${namespace}" does not exist`
        }
      }
      
      return {
        exists: true
      }
      
    } catch (error) {
      logger.error(`Failed to validate namespace ${namespace}:`, error)
      return {
        exists: false,
        error: `Failed to validate namespace: ${error}`
      }
    }
  }

  async deployJupyterLab(config: any): Promise<{ podName: string; status: PodStatus }> {
    logger.info('🚀 Starting JupyterLab deployment...')

    // Validate connection
    await this.validateConnection(config.kubernetes.kubeConfigPath)
    logger.info('✅ Kubernetes connection validated')

    // Deploy secrets
    await this.deploySecrets(config)
    logger.info('✅ Secrets deployed')

    // Create pod
    const podName = await this.createJupyterLabPod(config)
    logger.info(`✅ Pod created: ${podName}`)

    // Wait for pod to be ready
    const status = await this.waitForPodReady(podName)
    logger.info('✅ Pod is ready!')

    return { podName, status }
  }

  async cleanupJupyterLab(podName: string): Promise<void> {
    try {
      await this.ensureNamespaceSet()
      
      // Delete the deployment
      await this.k8sAppsApi.deleteNamespacedDeployment({
        name: podName,
        namespace: this.namespace
      })
      logger.info(`Deleted deployment: ${podName}`)

      // Clean up secrets (optional - you might want to keep them for next deployment)
      const secretsToDelete = ['jupyter-ssh-key', 'jupyter-git-config']
      for (const secretName of secretsToDelete) {
        try {
          await this.k8sApi.deleteNamespacedSecret({
            name: secretName,
            namespace: this.namespace
          })
          logger.info(`Deleted secret: ${secretName}`)
        } catch (error: any) {
          if (error.response?.status !== 404) {
            logger.warn(`Failed to delete secret ${secretName}:`, error.message)
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup JupyterLab:', error)
      throw error
    }
  }

  // Port forwarding methods (delegated to KubernetesPortForwardService)
  async startPortForward(podName: string, localPort: number = 8888, remotePort: number = 8888): Promise<{ success: boolean; message: string; url?: string }> {
    await this.ensureNamespaceSet()
    return await this.portForwardService.startPortForward(podName, localPort, remotePort)
  }

  /**
   * Fast reconnection method for existing pods - skips deployment steps
   */
  async fastReconnectToPod(podName: string): Promise<{ success: boolean; message: string; url?: string }> {
    await this.ensureNamespaceSet()
    return await this.portForwardService.fastReconnectToPod(podName)
  }

  async stopPortForward(): Promise<{ success: boolean; message: string }> {
    return await this.portForwardService.stopPortForward()
  }

  getPortForwardStatus(): { 
    status: string; 
    isActive: boolean; 
    restartCount: number; 
    autoRestartEnabled: boolean;
    restartInProgress: boolean;
    starting: boolean;
    config: { podName: string; localPort: number; remotePort: number } | null
  } {
    const status = this.portForwardService.getPortForwardStatus()
    return {
      status: status.status,
      isActive: status.isActive,
      restartCount: status.restartCount,
      autoRestartEnabled: status.autoRestartEnabled,
      restartInProgress: status.restartInProgress,
      starting: status.starting,
      config: status.config
    }
  }
}

export const kubernetesMainService = new KubernetesMainService() 