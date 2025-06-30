// type-only for compile-time helpers (no runtime import)
import type { KubeConfig, CoreV1Api, AppsV1Api, Watch, PortForward } from '@kubernetes/client-node';

// Runtime dynamic import helper (ESM-only module)
type K8sModule = typeof import('@kubernetes/client-node');
let k8sPromise: Promise<K8sModule> | null = null;
const getK8s = () => {
  if (!k8sPromise) {
    const dynamicImporter = new Function(
      'modulePath',
      'return import(modulePath)'
    ) as (path: string) => Promise<K8sModule>;
    k8sPromise = dynamicImporter('@kubernetes/client-node');
  }
  return k8sPromise;
};

import { ManifestManager } from './manifest';
import { logger } from './logging-service';
import { BrowserWindow } from 'electron';
import * as net from 'net';
import { ElectronAppState, DeploymentProgress, DeploymentPhase } from '../src/types/app';
import { DeploymentManager } from './deployment-manager';
import { PortForwardManager } from './portforward-manager';

export class KubernetesService {
    private kc: KubeConfig | null = null;
    private k8sApi!: CoreV1Api;
    private k8sAppsApi!: AppsV1Api;
    private manifestManager: ManifestManager;
    private watch: Watch | null = null;
    private watchRequest: AbortController | null = null;
    private isDeploying: boolean = false;
    private isCancelled: boolean = false;
    private portForward: PortForward | null = null;
    private portForwardMgr: PortForwardManager | null = null;
    private deploymentName: string | null = null;
    private namespace: string | null = null;
    private deploymentMgr = DeploymentManager.getInstance();


    constructor(private window: BrowserWindow) {
        this.manifestManager = ManifestManager.getInstance();
    }

    private sendProgress(update: Partial<DeploymentProgress>) {
        if (!this.window.isDestroyed()) {
            this.window.webContents.send('k8s-deployment-progress', update);
        }
    }

    private async loadKubeConfig(config: ElectronAppState): Promise<void> {
        this.sendProgress({ phase: 'initializing', message: 'Loading Kubernetes configuration...', progress: 5 });
        const k8s = await getK8s();
        if (!this.kc) this.kc = new k8s.KubeConfig();
        if (config.kubeConfig.kubeConfigPath) {
            const fs = await import('fs/promises');
            const fileContent = await fs.readFile(config.kubeConfig.kubeConfigPath, { encoding: 'utf8' });
            this.kc.loadFromString(fileContent);
            this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
            this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
            this.namespace = config.kubeConfig.namespace || 'default';
        } else {
            throw new Error('Kubeconfig path is not set.');
        }
    }

    public async deployWithProgress(config: ElectronAppState): Promise<void> {
        if (this.isDeploying) {
            throw new Error('A deployment is already in progress.');
        }
        this.isDeploying = true;
        this.isCancelled = false;

        try {
            await this.loadKubeConfig(config);

            this.sendProgress({ phase: 'validating-connection', message: 'Validating connection to Kubernetes cluster...', progress: 10 });
            await this.k8sApi.getAPIResources(); // Simple check to see if we can talk to the cluster

            this.sendProgress({ phase: 'creating-manifests', message: 'Ensuring deployment exists...', progress: 20 });
            const ensure = await this.deploymentMgr.ensureDeployment(config as any, this.kc!);
            this.deploymentName = ensure.podName.replace(/-0$/, '');

            if (ensure.created) {
                this.sendProgress({ phase: 'applying-manifests', message: 'Deployment created, waiting for pod...', progress: 30 });
            } else {
                this.sendProgress({ phase: 'waiting-for-pod', message: 'Found existing pod, attaching...', progress: 40 });
            }

            const podName = `${this.deploymentName}-0`;
            this.sendProgress({ phase: 'waiting-for-pod', message: `Waiting for pod ${podName} to be scheduled...`, podName, progress: 40 });

            await this.watchPod(podName);

        } catch (error: any) {
            logger.error('Deployment failed:', error);
            this.sendProgress({ phase: 'error', message: 'Deployment failed.', error: error.message || String(error), progress: 100 });
            this.cleanupOnFailure();
        } finally {
            this.isDeploying = false;
        }
    }
    
    private async watchPod(podName: string): Promise<void> {
        const k8s = await getK8s();
        this.watch = new k8s.Watch(this.kc!);
        this.watchRequest = await this.watch.watch(
            `/api/v1/namespaces/${this.namespace}/pods`,
            {
                fieldSelector: `metadata.name=${podName}`,
            },
            (type, apiObj, watchObj) => {
                if (this.isCancelled) {
                    this.watchRequest?.abort();
                    return;
                }

                if (type === 'ADDED' || type === 'MODIFIED') {
                    const pod = apiObj as any;
                    if (!pod.status) return;
                    
                    const status = pod.status;
                    const podStatus = {
                        status: status.phase,
                        ready: status.containerStatuses?.every((c: { ready?: boolean }) => c.ready) || false,
                        phase: status.phase,
                        restartCount: status.containerStatuses?.[0]?.restartCount || 0,
                        ip: status.podIP,
                        startTime: status.startTime,
                    };
                    this.sendProgress({ podStatus });

                    if (podStatus.ready) {
                        this.sendProgress({ phase: 'pod-ready', message: 'Pod is ready. Setting up access...', progress: 80 });
                        this.setupPortForward(podName).catch(e => {
                            this.sendProgress({ phase: 'error', message: 'Failed to set up port forwarding.', error: e.message, progress: 100 });
                        });
                        this.watchRequest?.abort();
                    } else {
                      this.sendProgress({ message: `Pod is ${status.phase}...`, progress: 60 });
                    }
                }
            },
            (err) => {
                if (err) {
                    logger.error('Watch error:', err);
                    if (!this.isCancelled) {
                        this.sendProgress({ phase: 'error', message: 'Error watching pod status.', error: err.message, progress: 100 });
                    }
                }
            }
        );
    }

    private async setupPortForward(podName: string): Promise<void> {
        this.sendProgress({ phase: 'setting-up-access', message: 'Setting up secure access to JupyterLab...', progress: 90 });
        if (!this.namespace) {
            this.sendProgress({ phase: 'error', message: 'Namespace not set for port forwarding.', progress: 100 });
            return;
        }
        this.portForwardMgr = new PortForwardManager(this.kc!);
        await this.portForwardMgr.forward(this.namespace!, podName);
        const jupyterUrl = `http://127.0.0.1:8888`;
        this.sendProgress({ phase: 'ready', message: 'JupyterLab is ready!', jupyterUrl, progress: 100 });
    }

    public async stopCurrentDeployment(): Promise<void> {
        this.isCancelled = true;
        if (this.watchRequest) {
            this.watchRequest.abort();
            this.watchRequest = null;
        }
        if (this.portForwardMgr) {
            this.portForwardMgr.stop();
        }
        if (this.deploymentName) {
            await this.cleanupJupyterLab(this.deploymentName);
        }
        this.sendProgress({phase: 'cancelled', message: 'Deployment cancelled.'});
        this.isDeploying = false;
    }
    
    public async cleanupJupyterLab(deploymentName: string): Promise<void> {
        if (!this.k8sAppsApi) await this.loadKubeConfig({} as any); // cheap way to get apis
        
        if (!this.namespace) {
            logger.error('Cannot cleanup, namespace is not set');
            return;
        }

        try {
            logger.info(`Cleaning up statefulset ${deploymentName}...`);
            await this.k8sAppsApi.deleteNamespacedStatefulSet({ name: deploymentName, namespace: this.namespace });
            // secrets and configmaps are not deleted to allow for inspection.
            // A more robust implementation might use owner references.
        } catch (error: any) {
            logger.error(`Failed to cleanup jupyterlab: ${error.message}`);
            // ignore not found errors
            if (error.statusCode !== 404) {
              throw error;
            }
        }
    }
    
    private async cleanupOnFailure() {
        if (this.deploymentName) {
            await this.cleanupJupyterLab(this.deploymentName);
        }
    }
} 