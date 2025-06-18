// Port forwarding types and interfaces for the frontend API
// These mirror the electron service interfaces but for IPC communication

export interface PortForwardConfig {
  podName: string
  localPort: number
  remotePort: number
}

export interface PortForwardResult {
  success: boolean
  message: string
  url?: string
}

export interface PortForwardStatus {
  status: 'stopped' | 'starting' | 'running' | 'error'
  isActive: boolean
  restartCount: number
  autoRestartEnabled: boolean
  restartInProgress: boolean
  starting: boolean
  config: PortForwardConfig | null
}

/**
 * Kubernetes Port Forwarding service for the frontend
 * This service communicates with the Electron main process via IPC
 * and provides a clean interface for port forwarding operations
 */
export class KubernetesPortForwardService {
  
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
  }

  /**
   * Start port forwarding for a pod
   */
  async startPortForward(podName: string, localPort: number = 8888, remotePort: number = 8888): Promise<PortForwardResult> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.startPortForward(podName, localPort, remotePort)
  }

  /**
   * Stop port forwarding
   */
  async stopPortForward(): Promise<PortForwardResult> {
    this.checkElectronAPI()
    return await window.electronAPI.kubernetes.stopPortForward()
  }

  /**
   * Get port forwarding status
   */
  async getPortForwardStatus(): Promise<PortForwardStatus> {
    this.checkElectronAPI()
    const status = await window.electronAPI.kubernetes.getPortForwardStatus()
    return status as PortForwardStatus
  }

  /**
   * Fast reconnection to existing pod - bypasses full deployment flow
   */
  async fastReconnectToPod(podName: string): Promise<PortForwardResult> {
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
}

// Export singleton instance
export const kubernetesPortForwardService = new KubernetesPortForwardService()
