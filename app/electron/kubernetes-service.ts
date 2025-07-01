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
import { ElectronAppState, DeploymentProgress, AppConfig } from '../src/types/app';
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
            
            // Log cluster info for debugging
            const cluster = this.kc.getCurrentCluster();
            if (cluster) {
                logger.info(`[KubernetesService] Connected to cluster: ${cluster.name} at ${cluster.server}`);
                if (cluster.skipTLSVerify) {
                    logger.info('[KubernetesService] Cluster is configured to skip TLS verification');
                }
            }
            
            this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
            this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
            this.namespace = config.kubeConfig.namespace || 'default';
        } else {
            throw new Error('Kubeconfig path is not set.');
        }
    }

    private async validateConnectionWithRetry(maxRetries: number = 3): Promise<void> {
        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                this.sendProgress({ 
                    phase: 'validating-connection', 
                    message: `Validating connection to Kubernetes cluster${i > 0 ? ` (attempt ${i + 1}/${maxRetries})` : ''}...`, 
                    progress: 10 
                });
                await this.k8sApi.getAPIResources();
                return; // Success!
            } catch (error: any) {
                lastError = error;
                logger.warn(`Connection attempt ${i + 1} failed:`, error.message);
                if (i < maxRetries - 1) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
        throw lastError;
    }

    public async deployWithProgress(config: ElectronAppState): Promise<void> {
        if (this.isDeploying) {
            logger.warn('Deployment already in progress, ignoring duplicate request');
            return;
        }
        this.isDeploying = true;
        this.isCancelled = false;

        try {
            // Validate config first
            if (!config || !config.kubeConfig || !config.kubeConfig.kubeConfigPath) {
                throw new Error('Invalid configuration: kubeConfigPath is missing');
            }

            await this.loadKubeConfig(config);

            // Try to connect with retries
            await this.validateConnectionWithRetry(3);

            this.sendProgress({ phase: 'creating-manifests', message: 'Checking for existing deployment...', progress: 20 });
            
            // Convert ElectronAppState to AppConfig format
            const appConfig: AppConfig = {
                kubernetes: {
                    kubeConfigPath: config.kubeConfig.kubeConfigPath!,
                    namespace: config.kubeConfig.namespace || 'default'
                },
                hardware: config.hardwareConfig,
                git: {
                    username: config.gitConfig.globalConfig.username,
                    email: config.gitConfig.globalConfig.email,
                    sshKeyPath: config.gitConfig.sshKeys?.[0]?.path || '',
                    sshKeyContent: config.gitConfig.sshKeys?.[0]?.content,
                    sshKeyTag: config.gitConfig.sshKeys?.[0]?.tag
                },
                environment: {
                    condaEnvironments: config.condaConfig.environments
                }
            };
            
            const ensure = await this.deploymentMgr.ensureDeployment(appConfig, this.kc!);
            this.deploymentName = ensure.podName.replace(/-0$/, '');

            if (ensure.existingDeployment && !ensure.created) {
                // Existing deployment found
                this.sendProgress({ phase: 'waiting-for-pod', message: 'Found existing deployment, checking status...', progress: 30 });
                
                // Check if pod is already ready
                const status = await this.deploymentMgr.checkExistingDeployment(
                    this.deploymentName, 
                    this.namespace!, 
                    this.kc!
                );
                
                if (status.ready) {
                    // Pod is already ready, just setup port forwarding
                    this.sendProgress({ 
                        phase: 'setting-up-access', 
                        message: 'Existing pod is ready, setting up port forwarding...', 
                        podName: status.podName,
                        podStatus: {
                            status: status.phase!,
                            ready: true,
                            phase: status.phase!,
                            restartCount: 0
                        },
                        progress: 80 
                    });
                    
                    await this.deploymentMgr.setupPortForwardForExisting(
                        this.namespace!,
                        status.podName!,
                        this.kc!
                    );
                    
                    const jupyterUrl = `http://127.0.0.1:8888`;
                    this.sendProgress({ 
                        phase: 'ready', 
                        message: 'Connected to existing JupyterLab!', 
                        jupyterUrl, 
                        podName: status.podName,
                        podStatus: {
                            status: status.phase!,
                            ready: true,
                            phase: status.phase!,
                            restartCount: 0
                        },
                        progress: 100 
                    });
                    return;
                }
            }

            if (ensure.created) {
                this.sendProgress({ phase: 'applying-manifests', message: 'Deployment created, waiting for pod...', progress: 30 });
            } else {
                this.sendProgress({ phase: 'waiting-for-pod', message: 'Waiting for existing pod to be ready...', progress: 40 });
            }

            const podName = `${this.deploymentName}-0`;
            this.sendProgress({ phase: 'waiting-for-pod', message: `Waiting for pod ${podName} to be scheduled...`, podName, progress: 40 });

            await this.watchPod(podName);

        } catch (error: any) {
            logger.error('Deployment failed:', error);
            let errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
            
            // Provide more helpful error messages for common issues
            if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
                errorMessage = `Cannot connect to Kubernetes cluster. Please check:\n` +
                               `• Your internet connection\n` +
                               `• VPN connection (if required)\n` +
                               `• Kubernetes cluster is accessible\n\n` +
                               `Original error: ${errorMessage}`;
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage = `Connection to Kubernetes cluster timed out. The cluster might be unavailable or unreachable.`;
            } else if (error.message?.includes('certificate') || error.message?.includes('TLS')) {
                errorMessage = `TLS/Certificate error connecting to cluster. This might be a temporary issue.\n\n` +
                               `Original error: ${errorMessage}`;
            }
            
            // Special handling for port already in use - this isn't really a failure
            if (error.code === 'EADDRINUSE') {
                logger.info('Port already in use, assuming existing deployment is working');
                this.sendProgress({ 
                    phase: 'ready', 
                    message: 'Connected to existing JupyterLab!', 
                    jupyterUrl: 'http://127.0.0.1:8888',
                    podName: this.deploymentName ? `${this.deploymentName}-0` : 'unknown',
                    podStatus: {
                        status: 'Running',
                        ready: true,
                        phase: 'Running',
                        restartCount: 0
                    },
                    progress: 100 
                });
                return;
            }
            
            this.sendProgress({ 
                phase: 'error', 
                message: 'Deployment failed.', 
                error: errorMessage, 
                progress: 100 
            });
            this.cleanupOnFailure();
        } finally {
            this.isDeploying = false;
        }
    }
    
    private async watchPod(podName: string): Promise<void> {
        const k8s = await getK8s();
        this.watch = new k8s.Watch(this.kc!);
        
        const startWatching = async () => {
            try {
                if (!this.watch) {
                    throw new Error('Watch not initialized');
                }
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
                    async (err) => {
                        if (err) {
                            logger.warn('Watch error:', err);
                            
                            // Handle premature close by checking pod status directly
                            if (err.code === 'ERR_STREAM_PREMATURE_CLOSE' && !this.isCancelled) {
                                logger.info('Watch stream closed prematurely, checking pod status directly...');
                                this.sendProgress({ message: 'Connection interrupted, checking pod status...', progress: 65 });
                                
                                // Wait a bit and check pod status
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                try {
                                    if (!this.namespace) {
                                        throw new Error('Namespace not set');
                                    }
                                    const pod = await this.k8sApi.readNamespacedPod({ 
                                        name: podName, 
                                        namespace: this.namespace!
                                    });
                                    
                                    const status = pod.status;
                                    const isReady = status?.containerStatuses?.every((c: any) => c.ready) || false;
                                    
                                    if (isReady) {
                                        logger.info('Pod is ready after watch interruption');
                                        this.sendProgress({ phase: 'pod-ready', message: 'Pod is ready. Setting up access...', progress: 80 });
                                        await this.setupPortForward(podName);
                                    } else {
                                        // Pod not ready yet, restart watching
                                        logger.info('Pod not ready yet, restarting watch...');
                                        this.sendProgress({ message: 'Reconnecting to pod status updates...', progress: 50 });
                                        setTimeout(() => startWatching(), 1000);
                                    }
                                } catch (checkError: any) {
                                    logger.error('Failed to check pod status:', checkError);
                                    if (!this.isCancelled) {
                                        this.sendProgress({ phase: 'error', message: 'Failed to verify pod status.', error: checkError.message, progress: 100 });
                                    }
                                }
                            } else if (!this.isCancelled) {
                                this.sendProgress({ phase: 'error', message: 'Error watching pod status.', error: err.message || err.toString(), progress: 100 });
                            }
                        }
                    }
                );
            } catch (error: any) {
                logger.error('Failed to start watch:', error);
                this.sendProgress({ phase: 'error', message: 'Failed to monitor pod status.', error: error.message, progress: 100 });
            }
        };
        
        await startWatching();
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
        
        // Send complete information including pod details
        this.sendProgress({ 
            phase: 'ready', 
            message: 'JupyterLab is ready!', 
            jupyterUrl, 
            podName: podName,
            podStatus: {
                status: 'Running',
                ready: true,
                phase: 'Running',
                restartCount: 0
            },
            progress: 100 
        });
    }

    public async stopCurrentDeployment(): Promise<void> {
        this.isCancelled = true;
        if (this.watchRequest) {
            this.watchRequest.abort();
            this.watchRequest = null;
        }
        // Stop deployment manager's port forwarding
        this.deploymentMgr.stopPortForward();
        // Also stop any local port forwarding
        if (this.portForwardMgr) {
            this.portForwardMgr.stop();
            this.portForwardMgr = null;
        }
        if (this.deploymentName) {
            await this.cleanupJupyterLab(this.deploymentName);
        }
        this.sendProgress({phase: 'cancelled', message: 'Deployment cancelled.'});
        this.isDeploying = false;
    }
    
    public async cleanupJupyterLab(deploymentName: string): Promise<void> {
        if (!this.k8sAppsApi || !this.k8sApi) await this.loadKubeConfig({} as any); // cheap way to get apis
        
        if (!this.namespace) {
            logger.error('Cannot cleanup, namespace is not set');
            return;
        }

        try {
            logger.info(`Cleaning up resources for ${deploymentName}...`);
            
            // Delete StatefulSet
            try {
                await this.k8sAppsApi.deleteNamespacedStatefulSet({ name: deploymentName, namespace: this.namespace });
                logger.info(`Deleted StatefulSet: ${deploymentName}`);
            } catch (error: any) {
                if (error.statusCode !== 404) {
                    logger.error(`Failed to delete StatefulSet: ${error.message}`);
                    throw error;
                }
            }
            
            // Delete SSH key Secret
            const secretName = `${deploymentName}-ssh-secret`;
            try {
                await this.k8sApi.deleteNamespacedSecret({ name: secretName, namespace: this.namespace });
                logger.info(`Deleted Secret: ${secretName}`);
            } catch (error: any) {
                if (error.statusCode !== 404) {
                    logger.error(`Failed to delete Secret: ${error.message}`);
                    // Don't throw here, continue with cleanup
                }
            }
            
        } catch (error: any) {
            logger.error(`Failed to cleanup jupyterlab resources: ${error.message}`);
            throw error;
        }
    }
    
    private async cleanupOnFailure() {
        if (this.deploymentName) {
            await this.cleanupJupyterLab(this.deploymentName);
        }
    }
} 