import * as net from 'net'
import { logger } from './logging-service'
import type { KubeConfig } from '@kubernetes/client-node'

type K8sModule = typeof import('@kubernetes/client-node')
let k8sPromise: Promise<K8sModule> | null = null
const getK8s = () => (k8sPromise ??= import('@kubernetes/client-node') as Promise<K8sModule>)

export class PortForwardManager {
  private server: net.Server | null = null
  constructor(private kc: KubeConfig) {}

  public async forward(namespace: string, podName: string, containerPort = 8888, localPort = 8888): Promise<void> {
    const k8s = await getK8s()
    const portForward = new k8s.PortForward(this.kc)
    this.server = net.createServer(socket => {
      portForward.portForward(namespace, podName, [containerPort], socket, null, socket)
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(localPort, '127.0.0.1', () => {
        logger.info(`[PortForwardManager] Forwarding started on 127.0.0.1:${localPort}`)
        resolve()
      })
      this.server!.on('error', reject)
    })
  }

  public stop() {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }
} 