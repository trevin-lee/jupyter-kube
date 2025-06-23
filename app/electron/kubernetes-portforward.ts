import { PodStatus } from './kubernetes-service'
import { logger } from './logging-service'

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

export class KubernetesPortForwardService {
  private portForwardProcess: any = null
  private portForwardStatus: 'stopped' | 'starting' | 'running' | 'error' = 'stopped'
  private portForwardConfig: PortForwardConfig | null = null
  private portForwardRestartCount: number = 0
  private maxRestartAttempts: number = 3
  private restartDelay: number = 5000 // 5 seconds
  private autoRestartEnabled: boolean = true
  private restartInProgress: boolean = false // Prevent concurrent restarts
  private restartTimeout: NodeJS.Timeout | null = null
  private portForwardStarting: boolean = false // Prevent concurrent port forward attempts

  constructor(
    private namespace: string,
    private getPodStatus: (podName: string) => Promise<PodStatus>
  ) {}

  async startPortForward(podName: string, localPort: number = 8888, remotePort: number = 8888): Promise<PortForwardResult> {
    try {
      // Prevent concurrent port forwarding attempts
      if (this.portForwardStarting) {
        logger.info(`⏳ Port forwarding already starting for another request, waiting...`)
        // Wait for the current attempt to complete
        let waitCount = 0
        while (this.portForwardStarting && waitCount < 30) { // Wait up to 15 seconds
          await new Promise(resolve => setTimeout(resolve, 500))
          waitCount++
        }
        
        // If we already have port forwarding running for this pod, return success
        if (this.portForwardStatus === 'running' && this.portForwardConfig?.podName === podName) {
          logger.info(`✅ Port forwarding already active for pod ${podName}`)
          return {
            success: true,
            message: `Port forwarding already active for pod ${podName}`,
            url: `http://localhost:${this.portForwardConfig.localPort}/lab`
          }
        }
      }
      
      this.portForwardStarting = true
      
      try {
        // Check if pod is ready before starting port forwarding
        logger.info(`🔍 Checking pod readiness before starting port forward for ${podName}`)
        const podStatus = await this.getPodStatus(podName)
        logger.info(`📋 Pod ${podName} status: ${podStatus.phase}, ready: ${podStatus.ready}`)
        
        if (podStatus.phase !== 'Running' || !podStatus.ready) {
          return {
            success: false,
            message: `Pod is not ready for port forwarding. Status: ${podStatus.phase}, Ready: ${podStatus.ready}. Please wait for pod to be ready.`
          }
        }
        
        logger.info(`✅ Pod is ready, proceeding with port forward setup`)
        
        // Clear any existing restart timeout
        if (this.restartTimeout) {
          clearTimeout(this.restartTimeout)
          this.restartTimeout = null
        }
        
        // Store config for auto-restart
        this.portForwardConfig = { podName, localPort, remotePort }
        this.portForwardRestartCount = 0
        this.autoRestartEnabled = true
        this.restartInProgress = false
        
        const result = await this._startPortForwardProcess()
        return result
        
      } finally {
        this.portForwardStarting = false
      }

    } catch (error) {
      logger.error('Failed to start port forwarding:', error)
      this.portForwardStatus = 'error'
      this.portForwardStarting = false
      return {
        success: false,
        message: `Failed to start port forwarding: ${error}`
      }
    }
  }

  /**
   * Fast reconnection method for existing pods - skips deployment steps
   */
  async fastReconnectToPod(podName: string): Promise<PortForwardResult> {
    try {
      logger.info(`🚀 Attempting fast reconnection to existing pod: ${podName}`)
      
      // Super fast path: check if we already have port forwarding running for this pod
      if (this.portForwardStatus === 'running' && this.portForwardConfig?.podName === podName) {
        logger.info(`⚡ Ultra-fast reconnection: port forwarding already active for pod ${podName}!`)
        return {
          success: true,
          message: `Ultra-fast reconnection: JupyterLab already connected!`,
          url: `http://localhost:${this.portForwardConfig.localPort}/lab`
        }
      }
      
      // Quick pod existence and health check
      const podStatus = await this.getPodStatus(podName)
      
      if (podStatus.phase !== 'Running' || !podStatus.ready) {
        return {
          success: false,
          message: `Pod ${podName} is not ready for reconnection. Status: ${podStatus.phase}, Ready: ${podStatus.ready}`
        }
      }
      
      logger.info(`✅ Pod ${podName} is healthy, starting port forwarding...`)
      
      // Start port forwarding immediately
      const portForwardResult = await this.startPortForward(podName, 8888, 8888)
      
      if (portForwardResult.success) {
        logger.info(`🎉 Fast reconnection successful to pod: ${podName}`)
        return {
          success: true,
          message: `Successfully reconnected to existing JupyterLab pod: ${podName}`,
          url: portForwardResult.url
        }
      } else {
        return {
          success: false,
          message: `Failed to establish port forwarding to pod ${podName}: ${portForwardResult.message}`
        }
      }
      
    } catch (error: any) {
      logger.error(`❌ Fast reconnection failed for pod ${podName}:`, error)
      return {
        success: false,
        message: `Fast reconnection failed: ${error.message}`
      }
    }
  }

  async stopPortForward(): Promise<PortForwardResult> {
    try {
      logger.info('🛑 Stopping port forwarding...')
      
      // Disable auto-restart and clear any pending restarts
      this.autoRestartEnabled = false
      this.portForwardConfig = null
      this.restartInProgress = false
      this.portForwardStarting = false // Reset starting flag
      
      if (this.restartTimeout) {
        clearTimeout(this.restartTimeout)
        this.restartTimeout = null
      }
      
      // Kill all port forwarding processes thoroughly
      await this._killAllPortForwardProcesses()
      
      if (this.portForwardProcess) {
        await this._killPortForwardProcess()
      }
      
      this.portForwardProcess = null
      this.portForwardStatus = 'stopped'
      
      return {
        success: true,
        message: 'Port forwarding stopped'
      }

    } catch (error) {
      logger.error('Failed to stop port forwarding:', error)
      return {
        success: false,
        message: `Failed to stop port forwarding: ${error}`
      }
    }
  }

  getPortForwardStatus(): PortForwardStatus {
    return {
      status: this.portForwardStatus,
      isActive: this.portForwardStatus === 'running',
      restartCount: this.portForwardRestartCount,
      autoRestartEnabled: this.autoRestartEnabled,
      restartInProgress: this.restartInProgress,
      starting: this.portForwardStarting,
      config: this.portForwardConfig
    }
  }

  private async _startPortForwardProcess(): Promise<PortForwardResult> {
    if (!this.portForwardConfig) {
      return { success: false, message: 'No port forward configuration available' }
    }

    const { podName, localPort, remotePort } = this.portForwardConfig

    // Kill any existing port forward processes (including zombies)
    await this._killAllPortForwardProcesses()
    
    // Stop any existing port forward
    if (this.portForwardProcess) {
      await this._killPortForwardProcess()
    }

    logger.info(`🔌 Starting port forward for pod ${podName}: localhost:${localPort} -> ${remotePort} (attempt ${this.portForwardRestartCount + 1})`)
    this.portForwardStatus = 'starting'

    const { spawn } = require('child_process')
    
    // Use kubectl port-forward command
    const args = [
      'port-forward',
      `pod/${podName}`,
      `${localPort}:${remotePort}`,
      '-n', this.namespace
    ]

    this.portForwardProcess = spawn('kubectl', args)

    return new Promise((resolve) => {
      let hasResolved = false
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true
          this.portForwardStatus = 'error'
          resolve({
            success: false,
            message: 'Port forwarding startup timeout'
          })
        }
      }, 10000) // 10 second timeout

      this.portForwardProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString()
        logger.info(`📡 Port forward stdout: ${output.trim()}`)
        
        if (output.includes('Forwarding from') && !hasResolved) {
          hasResolved = true
          clearTimeout(timeout)
          this.portForwardStatus = 'running'
          this.portForwardRestartCount = 0 // Reset restart count on successful start
          resolve({
            success: true,
            message: `Port forwarding active: localhost:${localPort} -> ${podName}:${remotePort}`,
            url: `http://localhost:${localPort}/lab`
          })
        }
      })

      this.portForwardProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString()
        logger.error(`❌ Port forward stderr: ${error.trim()}`)
        
        // Handle specific network namespace errors (indicates pod is terminating/restarting)
        if (error.includes('network namespace for sandbox') && error.includes('is closed')) {
          logger.warn(`⚠️ Pod network namespace is closed - pod may be terminating or restarting`)
          // Don't fail immediately for namespace errors - let auto-restart handle it
          return
        }
        
        // Only fail immediately on critical startup errors
        if (!hasResolved && (
          error.includes('unable to forward port') || 
          error.includes('error: unable to listen') ||
          error.includes('bind: address already in use') ||
          error.includes('pods') && error.includes('not found') // Pod doesn't exist
        )) {
          hasResolved = true
          clearTimeout(timeout)
          this.portForwardStatus = 'error'
          resolve({
            success: false,
            message: `Port forwarding failed: ${error.trim()}`
          })
        }
      })

      this.portForwardProcess.on('close', (code: number | null) => {
        logger.info(`🔌 Port forward process closed with code ${code}`)
        this.portForwardStatus = 'stopped'
        this.portForwardProcess = null
        
        // Auto-restart if enabled and we haven't exceeded max attempts
        // Only restart on unexpected exits (not manual stops or clean shutdowns)
        if (this.autoRestartEnabled && 
            !this.restartInProgress &&
            this.portForwardRestartCount < this.maxRestartAttempts && 
            code !== 0 && code !== null && // Don't restart if it was a clean exit or manual termination
            this.portForwardConfig) {
          
          this.restartInProgress = true
          this.portForwardRestartCount++
          logger.info(`🔄 Auto-restarting port forward in ${this.restartDelay}ms (attempt ${this.portForwardRestartCount}/${this.maxRestartAttempts})`)
          
          this.restartTimeout = setTimeout(async () => {
            if (this.autoRestartEnabled && this.portForwardConfig && this.restartInProgress) {
              try {
                // Check if pod exists and is ready before attempting port forward
                try {
                  const podStatus = await this.getPodStatus(this.portForwardConfig.podName)
                  logger.info(`📋 Pod readiness check: ${this.portForwardConfig.podName} status=${podStatus.phase}, ready=${podStatus.ready}`)
                  
                  if (podStatus.phase !== 'Running' || !podStatus.ready) {
                    logger.warn(`⏳ Pod not ready yet (${podStatus.phase}), skipping auto-restart for now`)
                    this.restartInProgress = false
                    // Don't restart if pod isn't ready - let the main deployment flow handle it
                    return
                  }
                } catch (podError: any) {
                  if (podError.code === 404 || podError.response?.status === 404 || podError.message?.includes('not found')) {
                    logger.warn(`⚠️ Pod ${this.portForwardConfig.podName} no longer exists, stopping auto-restart`)
                    this.autoRestartEnabled = false
                    this.restartInProgress = false
                    return
                  } else {
                    logger.error(`❌ Failed to check pod status during auto-restart:`, podError)
                    this.restartInProgress = false
                    return
                  }
                }
                
                logger.info(`✅ Pod is ready, proceeding with port forward restart (attempt ${this.portForwardRestartCount}/${this.maxRestartAttempts})`)
                
                // Give extra time for port cleanup on subsequent attempts
                const extraDelay = this.portForwardRestartCount * 2000 // 2s, 4s, 6s...
                if (extraDelay > 0) {
                  logger.info(`⏳ Adding ${extraDelay}ms extra delay for attempt ${this.portForwardRestartCount}`)
                  await new Promise(resolve => setTimeout(resolve, extraDelay))
                }
                await this._startPortForwardProcess()
              } catch (error) {
                logger.error('Failed to auto-restart port forwarding:', error)
              } finally {
                this.restartInProgress = false
              }
            } else {
              this.restartInProgress = false
            }
          }, this.restartDelay)
        } else if (this.portForwardRestartCount >= this.maxRestartAttempts) {
          logger.error(`❌ Port forwarding failed after ${this.maxRestartAttempts} restart attempts`)
          this.portForwardStatus = 'error'
          this.restartInProgress = false
        } else {
          this.restartInProgress = false
        }
      })

      this.portForwardProcess.on('error', (error: Error) => {
        logger.error(`❌ Port forward process error: ${error.message}`)
        
        if (!hasResolved) {
          hasResolved = true
          clearTimeout(timeout)
          this.portForwardStatus = 'error'
          resolve({
            success: false,
            message: `Port forwarding error: ${error.message}`
          })
        }
      })
    })
  }

  private async _killPortForwardProcess(): Promise<void> {
    if (!this.portForwardProcess) return

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if it doesn't close gracefully
        if (this.portForwardProcess) {
          this.portForwardProcess.kill('SIGKILL')
        }
        resolve()
      }, 3000)

      this.portForwardProcess.on('close', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.portForwardProcess.kill('SIGTERM')
    })
  }

  private async _killAllPortForwardProcesses(): Promise<void> {
    try {
      const { exec } = require('child_process')
      
      // Kill all kubectl port-forward processes for this port
      const command = process.platform === 'win32' 
        ? `taskkill /F /IM kubectl.exe 2>nul || exit 0`
        : `pkill -f "kubectl.*port-forward.*8888" || true`
      
      await new Promise<void>((resolve) => {
        exec(command, (error: any, stdout: string, stderr: string) => {
          if (error && !error.message.includes('No such process')) {
            logger.warn(`⚠️ Error killing port-forward processes: ${error.message}`)
          } else {
            logger.info(`🧹 Cleaned up any existing port-forward processes`)
          }
          resolve()
        })
      })
      
      // Wait a moment for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 2000))
      
    } catch (error) {
      logger.warn(`⚠️ Could not clean up port-forward processes: ${error}`)
    }
  }

  // Update namespace when needed
  updateNamespace(namespace: string): void {
    this.namespace = namespace
  }
} 