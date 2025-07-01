import * as net from 'net'
import { logger } from './logging-service'
import type { KubeConfig } from '@kubernetes/client-node'

type K8sModule = typeof import('@kubernetes/client-node')
let k8sPromise: Promise<K8sModule> | null = null
const getK8s = () => {
  if (!k8sPromise) {
    // Use Function constructor to prevent TypeScript from transpiling this
    const dynamicImport = new Function('specifier', 'return import(specifier)')
    k8sPromise = dynamicImport('@kubernetes/client-node') as Promise<K8sModule>
  }
  return k8sPromise
}

export class PortForwardManager {
  private server: net.Server | null = null
  private currentPort: number | null = null
  private currentPod: string | null = null
  private connections: Set<net.Socket> = new Set()
  
  constructor(private kc: KubeConfig) {}

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
      tester.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true)
        } else {
          resolve(false)
        }
      })
      tester.once('listening', () => {
        tester.once('close', () => resolve(false))
        tester.close()
      })
      tester.listen(port, '127.0.0.1')
    })
  }

  public async forward(namespace: string, podName: string, containerPort = 8888, localPort = 8888): Promise<void> {
    // If we already have a server on this port for this pod, just return
    if (this.server && this.currentPort === localPort && this.currentPod === podName) {
      logger.info(`[PortForwardManager] Port forward already active for ${podName} on port ${localPort}`)
      return
    }

    // Check if port is in use
    const portInUse = await this.isPortInUse(localPort)
    if (portInUse) {
      // If port is in use but it's not our server, we might have a stale port forward
      logger.warn(`[PortForwardManager] Port ${localPort} is already in use`)
      
      // Try to stop any existing server
      this.stop()
      
      // Check again after stopping
      const stillInUse = await this.isPortInUse(localPort)
      if (stillInUse) {
        logger.info(`[PortForwardManager] Port ${localPort} is still in use, assuming existing forward is active`)
        // Store the info so we know we're "connected"
        this.currentPort = localPort
        this.currentPod = podName
        return
      }
    }

    // Stop any existing server before creating a new one
    this.stop()

    const k8s = await getK8s()
    const portForward = new k8s.PortForward(this.kc)
    
    this.server = net.createServer(socket => {
      // Track this connection
      this.connections.add(socket)
      
      // Handle socket errors gracefully
      socket.on('error', (err) => {
        logger.warn('[PortForwardManager] Socket error:', err.message)
        this.connections.delete(socket)
      })
      
      socket.on('close', () => {
        this.connections.delete(socket)
      })
      
      try {
        portForward.portForward(namespace, podName, [containerPort], socket, null, socket)
          .catch(err => {
            logger.error('[PortForwardManager] Port forward error:', err.message)
            if (!socket.destroyed) {
              socket.destroy()
            }
          })
      } catch (err: any) {
        logger.error('[PortForwardManager] Failed to setup port forward:', err.message)
        if (!socket.destroyed) {
          socket.destroy()
        }
      }
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(localPort, '127.0.0.1', () => {
        logger.info(`[PortForwardManager] Forwarding started on 127.0.0.1:${localPort}`)
        this.currentPort = localPort
        this.currentPod = podName
        resolve()
      })
      this.server!.on('error', (err) => {
        logger.error('[PortForwardManager] Server error:', err)
        reject(err)
      })
    })
  }

  public stop() {
    if (this.server) {
      logger.info('[PortForwardManager] Stopping port forward')
      
      // Close all active connections
      this.connections.forEach(socket => {
        if (!socket.destroyed) {
          socket.destroy()
        }
      })
      this.connections.clear()
      
      this.server.close()
      this.server = null
      this.currentPort = null
      this.currentPod = null
    }
  }
} 