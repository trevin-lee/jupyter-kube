// Kubernetes service that communicates with the Electron main process via IPC
// This avoids importing Node.js modules in the browser environment

import { PodStatus } from '../types/app'

interface ElectronAPI {
  kubeconfig: {
    detect: () => Promise<{ found: boolean; path: string | null; source: 'environment' | 'default' | null }>
  }
  kubernetes: {
    validateConnection: (kubeConfigPath: string) => Promise<boolean>
    deploySecrets: (config: any) => Promise<boolean>
    createJupyterLabPod: (config: any) => Promise<string>
    getPodStatus: (podName: string) => Promise<PodStatus>
    waitForPodReady: (podName: string, timeoutMs?: number) => Promise<PodStatus>
    deployJupyterLab: (config: any) => Promise<{ podName: string; status: PodStatus }>
    cleanupJupyterLab: (podName: string) => Promise<boolean>
    listAvailableNamespaces: () => Promise<string[]>
    detectDefaultNamespace: () => Promise<{ defaultNamespace: string | null, availableNamespaces: string[] }>
    validateNamespace: (namespace: string) => Promise<{ 
      exists: boolean,
      error?: string
    }>
    // Port forwarding APIs
    startPortForward: (podName: string, localPort?: number, remotePort?: number) => Promise<{ success: boolean; message: string; url?: string }>
    stopPortForward: () => Promise<{ success: boolean; message: string }>
    getPortForwardStatus: () => Promise<{ status: string; isActive: boolean }>
    fastReconnectToPod: (podName: string) => Promise<{ success: boolean; message: string; url?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export interface DeploymentProgress {
  phase: 'initializing' | 'validating-connection' | 'creating-deployment' | 'waiting-for-pod' | 'waiting-for-ready' | 'setting-up-access' | 'ready' | 'error'
  progress: number
  message: string
  podName?: string
  podStatus?: PodStatus
  jupyterUrl?: string
  error?: string
}

/**
 * Kubernetes service that communicates with the main process via IPC
 */
export class KubernetesService {
  private isDeploying: boolean = false
  private currentPodName: string | null = null
  
  /**
   * Check if the Electron API is available
   */
  private checkElectronAPI(): void {
    if (typeof window === 'undefined') {
      throw new Error('Window object not available - not running in browser context')
    }
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available - preload script may not be loaded')
    }
    
    if (!window.electronAPI.kubernetes) {
      throw new Error('Kubernetes API not available - main process handlers may not be registered')
    }
    
    console.log('✅ Electron API available:', Object.keys(window.electronAPI))
    console.log('🔍 Kubernetes API methods:', Object.keys(window.electronAPI.kubernetes))
    console.log('🔍 Port forwarding methods available:', {
      startPortForward: typeof window.electronAPI.kubernetes.startPortForward,
      stopPortForward: typeof window.electronAPI.kubernetes.stopPortForward,
      getPortForwardStatus: typeof window.electronAPI.kubernetes.getPortForwardStatus
    })
  }

  /**
   * Validate Kubernetes connection
   */
  async validateConnection(kubeConfigPath: string): Promise<boolean> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.validateConnection(kubeConfigPath)
  }

  /**
   * Deploy secrets to Kubernetes
   */
  async deploySecrets(config: any): Promise<void> {
    this.checkElectronAPI()
    await window.electronAPI.kubernetes.deploySecrets(config)
  }

  /**
   * Create JupyterLab pod
   */
  async createJupyterLabPod(config: any): Promise<string> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.createJupyterLabPod(config)
  }

  /**
   * Get pod status
   */
  async getPodStatus(podName: string): Promise<PodStatus> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.getPodStatus(podName)
  }

  /**
   * Wait for pod to be ready
   */
  async waitForPodReady(podName: string, timeoutMs: number = 300000): Promise<PodStatus> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.waitForPodReady(podName, timeoutMs)
      }
      
  /**
   * Full deployment workflow - deploy secrets, create pod, and wait for ready
   */
  async deployJupyterLab(config: any): Promise<{ podName: string; status: PodStatus }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.deployJupyterLab(config)
      }

  /**
   * Clean up JupyterLab deployment
   */
  async cleanupJupyterLab(podName: string): Promise<void> {
    this.checkElectronAPI()
    await window.electronAPI.kubernetes.cleanupJupyterLab(podName)
  }

  /**
   * List available namespaces
   */
  async listAvailableNamespaces(): Promise<string[]> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.listAvailableNamespaces()
  }

  /**
   * Detect default namespace from kubeconfig
   */
  async detectDefaultNamespace(): Promise<{ defaultNamespace: string | null, availableNamespaces: string[] }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.detectDefaultNamespace()
  }

  /**
   * Validate namespace exists
   */
  async validateNamespace(namespace: string): Promise<{ 
    exists: boolean,
    error?: string
  }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.validateNamespace(namespace)
  }

  /**
   * Deployment with progress tracking (for use with loading page)
   */
  async deployWithProgress(
    config: any,
    onProgress?: (progress: DeploymentProgress) => void
  ): Promise<{ podName: string; status: PodStatus; jupyterUrl?: string }> {
    
    // Prevent concurrent deployments
    if (this.isDeploying) {
      throw new Error('Deployment already in progress. Please wait for the current deployment to complete.')
    }
    
    this.isDeploying = true
    let currentProgress = 0
    let lastProgressUpdate = { phase: '', progress: -1, message: '' }
    
    // Helper to ensure progress only increases and prevent duplicate updates
    const updateProgress = (phase: DeploymentProgress['phase'], progress: number, message: string, extra?: Partial<DeploymentProgress>) => {
      const newProgress = Math.max(currentProgress, progress)
      
      // Only send update if something has actually changed
      if (lastProgressUpdate.phase !== phase || 
          lastProgressUpdate.progress !== newProgress || 
          lastProgressUpdate.message !== message) {
        
        currentProgress = newProgress
        lastProgressUpdate = { phase, progress: newProgress, message }
        
        console.log(`📊 Progress: ${currentProgress}% [${phase}] ${message}`)
        onProgress?.({
          phase,
          progress: currentProgress,
          message,
          ...extra
        })
      }
    }
    
    try {
      // Check API availability first
      this.checkElectronAPI()
      
      // Phase 1: Initializing (0-10%)
      updateProgress('initializing', 5, 'Initializing deployment...')
      
      // Phase 2: Validating connection (10-25%)
      updateProgress('validating-connection', 15, 'Validating Kubernetes connection...')
      await this.validateConnection(config.kubernetes.kubeConfigPath)
      updateProgress('validating-connection', 25, 'Kubernetes connection validated')

      // Phase 3: Deploy secrets (25-35%)
      updateProgress('creating-deployment', 30, 'Deploying secrets...')
      await this.deploySecrets(config)
      updateProgress('creating-deployment', 35, 'Secrets deployed successfully')
      
      let podName: string
      let isExistingPod = false
      let status: PodStatus
      
      try {
        // Phase 4: Create deployment (35-50%)
        updateProgress('creating-deployment', 40, 'Creating deployment...')
        podName = await this.createJupyterLabPod(config)
        updateProgress('creating-deployment', 50, 'Deployment created successfully', { podName })
        isExistingPod = false
      } catch (createError: any) {
        // Handle existing pod scenario
        if (createError.message?.includes('EXISTING_POD_FOUND:') || createError.name === 'ExistingPodFound') {
          const match = createError.message.match(/EXISTING_POD_FOUND:([^:]+)$/)
          if (match) {
            podName = match[1]
            isExistingPod = true
            updateProgress('creating-deployment', 45, `Found existing deployment: ${podName}`, { podName })
            
            // Try fast reconnection for existing healthy pods (45-100%)
            try {
              updateProgress('setting-up-access', 60, 'Attempting fast reconnection...')
              const fastReconnectResult = await this.fastReconnectToPod(podName)
              
              if (fastReconnectResult.success) {
                const status = await this.getPodStatus(podName)
                updateProgress('ready', 100, 'Fast reconnection successful!', {
                  podName,
                  podStatus: status,
                  jupyterUrl: fastReconnectResult.url
                })
                return { podName, status, jupyterUrl: fastReconnectResult.url }
              } else {
                updateProgress('waiting-for-pod', 50, 'Fast reconnection failed, checking pod status...')
              }
            } catch (fastReconnectError) {
              updateProgress('waiting-for-pod', 50, 'Fast reconnection failed, checking pod status...')
            }
          } else {
            throw new Error('Invalid ExistingPodFound error format')
          }
        } else {
          throw createError
        }
      }
      
      // Store the current pod name for cleanup
      this.currentPodName = podName

      // Phase 5: Wait for pod to be ready (50-85%)
      updateProgress('waiting-for-pod', 55, isExistingPod ? 'Checking existing pod...' : 'Pod scheduled, waiting for startup...', { podName })
      
      // Poll status until ready
      const maxAttempts = 150 // 5 minutes at 2 second intervals
      let attempts = 0

      while (attempts < maxAttempts) {
        status = await this.getPodStatus(podName)
        
        if (status.phase === 'Failed') {
          throw new Error(`Pod failed: ${status.message}`)
        }
        
        if (status.phase === 'Running' && status.ready) {
          updateProgress('waiting-for-ready', 85, 'Pod is running and ready!', { podName, podStatus: status })
          break
        }

        // Calculate progress based on pod state and time elapsed
        let progressValue = 55 + Math.min(20, Math.floor(attempts / 5)) // Gradual increase over time
        let message = ''
        
        if (status.phase === 'Pending') {
          progressValue = Math.max(progressValue, 60)
          message = 'Pod pending - downloading images and scheduling...'
        } else if (status.phase === 'Running' && !status.ready) {
          progressValue = Math.max(progressValue, 75)
          message = 'Pod running - containers starting up...'
        } else {
          message = `Pod status: ${status.phase} - ${status.message || 'Waiting...'}`
        }

        updateProgress('waiting-for-ready', progressValue, message, { podName, podStatus: status })

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 2000))
        attempts++
      }

      if (attempts >= maxAttempts) {
        throw new Error('Pod did not become ready within timeout')
      }

      // Phase 6: Setting up access (85-95%)
      updateProgress('setting-up-access', 90, 'Setting up port forwarding...', { podName, podStatus: status! })

      // Automatically start port forwarding
      let jupyterUrl = ''
      try {
        const portForwardResult = await this.startPortForward(podName, 8888, 8888)
        if (portForwardResult.success && portForwardResult.url) {
          jupyterUrl = portForwardResult.url
          updateProgress('setting-up-access', 95, 'Port forwarding established')
        } else {
          updateProgress('setting-up-access', 95, 'Port forwarding setup completed (manual access required)')
        }
      } catch (error) {
        updateProgress('setting-up-access', 95, 'Port forwarding setup completed (manual access required)')
      }

      // Phase 7: Ready (100%)
      updateProgress('ready', 100, 'JupyterLab is ready!', {
        podName,
        podStatus: status!,
        jupyterUrl
      })

      return { podName, status: status!, jupyterUrl }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      onProgress?.({
        phase: 'error',
        progress: currentProgress, // Keep current progress, don't reset to 0
        message: `Deployment failed: ${errorMessage}`,
        error: errorMessage
      })
      throw error
    } finally {
      // Always reset the deployment flag
      this.isDeploying = false
    }
  }

  /**
   * Get JupyterLab status (convenience method)
   */
  async getJupyterLabStatus(podName: string): Promise<PodStatus> {
    this.checkElectronAPI()
    return await this.getPodStatus(podName)
  }

  /**
   * Start port forwarding for a pod
   */
  async startPortForward(podName: string, localPort: number = 8888, remotePort: number = 8888): Promise<{ success: boolean; message: string; url?: string }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.startPortForward(podName, localPort, remotePort)
  }

  /**
   * Stop port forwarding
   */
  async stopPortForward(): Promise<{ success: boolean; message: string }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.stopPortForward()
  }

  /**
   * Get port forwarding status
   */
  async getPortForwardStatus(): Promise<{ status: string; isActive: boolean }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.getPortForwardStatus()
  }

  /**
   * Fast reconnection to existing pod - bypasses full deployment flow
   */
  async fastReconnectToPod(podName: string): Promise<{ success: boolean; message: string; url?: string }> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.fastReconnectToPod(podName)
  }

  /**
   * Open JupyterLab in browser (utility method)
   */
  openJupyterLab(url: string): void {
    if (url && typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank')
    }
  }

  /**
   * Stop current deployment and clean up resources
   */
  async stopCurrentDeployment(): Promise<{ success: boolean; message: string }> {
    try {
      let cleanupResult = { success: true, message: 'No active deployment to stop' }
      
      // Stop port forwarding first
      try {
        const portResult = await this.stopPortForward()
        console.log('🛑 Port forwarding stopped:', portResult.message)
      } catch (error) {
        console.warn('⚠️ Failed to stop port forwarding:', error)
      }
      
      // Clean up current pod if exists
      if (this.currentPodName) {
        try {
          await this.cleanupJupyterLab(this.currentPodName)
          cleanupResult = { 
            success: true, 
            message: `Successfully stopped deployment and cleaned up pod: ${this.currentPodName}` 
          }
          console.log(`🧹 Cleaned up pod: ${this.currentPodName}`)
        } catch (error) {
          cleanupResult = { 
            success: false, 
            message: `Failed to cleanup pod ${this.currentPodName}: ${error}` 
          }
          console.error('❌ Failed to cleanup pod:', error)
        }
        this.currentPodName = null
      }
      
      // Reset deployment state
      this.isDeploying = false
      
      return cleanupResult
    } catch (error) {
      console.error('❌ Failed to stop deployment:', error)
      return { 
        success: false, 
        message: `Failed to stop deployment: ${error}` 
      }
    }
  }

  /**
   * Get current deployment status
   */
  getDeploymentStatus(): { isDeploying: boolean; currentPodName: string | null } {
    return {
      isDeploying: this.isDeploying,
      currentPodName: this.currentPodName
    }
  }
}

// Export singleton instance
export const kubernetesService = new KubernetesService()





