import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app } from 'electron';
import { execFileSync } from 'child_process';

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

    private async findKubectlPath(): Promise<string | null> {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Common kubectl locations
        const possiblePaths = [
            '/usr/local/bin/kubectl',
            '/usr/bin/kubectl',
            '/opt/homebrew/bin/kubectl',
            path.join(os.homedir(), '.local', 'bin', 'kubectl'),
            path.join(os.homedir(), 'bin', 'kubectl'),
        ];
        
        // Check if kubectl is already in PATH
        try {
            const { stdout } = await execAsync('which kubectl');
            const kubectlPath = stdout.trim();
            if (kubectlPath) {
                logger.info(`[KubernetesService] Found kubectl in PATH: ${kubectlPath}`);
                return path.dirname(kubectlPath);
            }
        } catch (error) {
            // kubectl not in PATH, continue checking known locations
        }
        
        // Check common locations
        for (const kubectlPath of possiblePaths) {
            try {
                await fs.promises.access(kubectlPath, fs.constants.X_OK);
                logger.info(`[KubernetesService] Found kubectl at: ${kubectlPath}`);
                return path.dirname(kubectlPath);
            } catch (error) {
                // Continue checking other paths
            }
        }
        
        logger.warn('[KubernetesService] kubectl not found in common locations');
        return null;
    }

    private async setupEnvironmentForOIDC(): Promise<void> {
        // Find kubectl and add to PATH if needed
        const kubectlDir = await this.findKubectlPath();
        if (kubectlDir) {
            const currentPath = process.env.PATH || '';
            if (!currentPath.includes(kubectlDir)) {
                process.env.PATH = `${kubectlDir}${path.delimiter}${currentPath}`;
                logger.info(`[KubernetesService] Added ${kubectlDir} to PATH for kubectl`);
            }
        }
        
        // Also check for common OIDC helpers like kubelogin
        const oidcHelpers = ['kubelogin', 'kubectl-oidc_login', 'kubectl-oidc-login'];
        for (const helper of oidcHelpers) {
            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const { stdout } = await execAsync(`which ${helper}`);
                if (stdout.trim()) {
                    logger.info(`[KubernetesService] Found OIDC helper ${helper} at: ${stdout.trim()}`);
                }
            } catch (error) {
                // Helper not found, continue
            }
        }
    }

    private async loadKubeConfig(config: ElectronAppState): Promise<void> {
        this.sendProgress({ phase: 'initializing', message: 'Loading Kubernetes configuration...', progress: 5 });
        
        // Set up environment for OIDC before loading kubeconfig
        await this.setupEnvironmentForOIDC();
        
        const k8s = await getK8s();
        if (!this.kc) this.kc = new k8s.KubeConfig();
        
        if (config.kubeConfig.kubeConfigPath) {
            const fs = await import('fs/promises');
            const fileContent = await fs.readFile(config.kubeConfig.kubeConfigPath, { encoding: 'utf8' });
            
            try {
                // Check if kubeconfig uses exec authentication
                const yaml = await import('js-yaml');
                const parsedConfig = yaml.load(fileContent) as any;
                
                if (parsedConfig.users) {
                    const hasExecAuth = parsedConfig.users.some((user: any) => 
                        user.user?.exec?.command
                    );
                    
                    if (hasExecAuth) {
                        logger.warn('[KubernetesService] Kubeconfig uses exec authentication');
                        
                        // Check if the exec commands are available
                        const execUsers = parsedConfig.users.filter((user: any) => user.user?.exec?.command);
                        for (const user of execUsers) {
                            const command = user.user.exec.command;
                            logger.info(`[KubernetesService] User ${user.name} requires exec command: ${command}`);
                            
                            // For OIDC, check if kubectl is actually available before throwing error
                            if (command.includes('kubectl') || command.includes('oidc-login')) {
                                // We already set up the environment for OIDC in setupEnvironmentForOIDC
                                // Let's verify kubectl is available
                                const kubectlDir = await this.findKubectlPath();
                                if (!kubectlDir) {
                                    const errorMsg = `Your Kubernetes configuration uses OIDC authentication which requires '${command}' to be installed on your system.\n\n` +
                                        `Please ensure ${command} is installed and available in your PATH.\n\n` +
                                        `Alternatively, you can use a different authentication method such as:\n` +
                                        `- Client certificates\n` +
                                        `- Service account tokens\n` +
                                        `- Static tokens`;
                                    
                                    throw new Error(errorMsg);
                                } else {
                                    logger.info(`[KubernetesService] kubectl found for OIDC authentication: ${kubectlDir}`);
                                }
                            }
                        }
                    }
                }
                
                this.kc.loadFromString(fileContent);
            } catch (error: any) {
                // Check if this is a kubectl spawn error
                if (error.code === 'ENOENT' && error.message?.includes('kubectl')) {
                    const errorMsg = 'Your Kubernetes configuration requires kubectl for authentication.\n\n' +
                        'Please install kubectl on your system and ensure it\'s available in your PATH.\n\n' +
                        'For macOS: brew install kubectl\n' +
                        'For Windows: choco install kubernetes-cli\n' +
                        'For Linux: See https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/';
                    
                    throw new Error(errorMsg);
                }
                throw error;
            }
            logger.info(`[KubernetesService] Loaded kubeconfig from ${config.kubeConfig.kubeConfigPath}`);
        } else {
            this.kc.loadFromDefault();
            logger.info('[KubernetesService] Loaded default kubeconfig');
        }
        
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
        
        this.sendProgress({ phase: 'initializing', message: 'Kubernetes configuration loaded', progress: 10 });
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
            
            // Debug logging for SSH key
            logger.info('[KubernetesService] Git config debug:', {
                hasSSHKeys: config.gitConfig.sshKeys?.length || 0,
                firstKeyPath: config.gitConfig.sshKeys?.[0]?.path,
                hasKeyContent: !!config.gitConfig.sshKeys?.[0]?.content,
                keyContentLength: config.gitConfig.sshKeys?.[0]?.content?.length || 0,
                keyTag: config.gitConfig.sshKeys?.[0]?.tag
            });
            
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
                                // Don't abort the watch - keep monitoring for pod deletion
                                // this.watchRequest?.abort();
                            } else {
                              this.sendProgress({ message: `Pod is ${status.phase}...`, progress: 60 });
                            }
                        } else if (type === 'DELETED') {
                            logger.warn(`[KubernetesService] Pod ${podName} has been deleted externally`);
                            
                            // Stop port forwarding immediately
                            if (this.portForwardMgr) {
                                logger.info('[KubernetesService] Stopping port forward due to pod deletion');
                                this.portForwardMgr.stop();
                                this.portForwardMgr = null;
                            }
                            
                            // Stop deployment manager's port forwarding as well
                            this.deploymentMgr.stopPortForward();
                            
                            // Notify the UI that the pod has been deleted
                            this.sendProgress({ 
                                phase: 'error', 
                                message: 'Pod has been deleted. Port forwarding stopped.', 
                                error: 'The JupyterLab pod was deleted externally',
                                progress: 100 
                            });
                            
                            // Abort the watch
                            this.watchRequest?.abort();
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
        logger.info(`[KubernetesService] Starting cleanup for ${deploymentName}...`);
        
        // IMPORTANT: Stop port forwarding FIRST before deleting the pod
        if (this.portForwardMgr) {
            logger.info('[KubernetesService] Stopping port forward before cleanup');
            this.portForwardMgr.stop();
            this.portForwardMgr = null;
        }
        
        // Also stop deployment manager's port forwarding
        this.deploymentMgr.stopPortForward();
        
        // Stop watching the pod if we're still watching it
        if (this.watchRequest) {
            logger.info('[KubernetesService] Stopping pod watch before cleanup');
            this.watchRequest.abort();
            this.watchRequest = null;
        }
        
        if (!this.k8sAppsApi || !this.k8sApi) await this.loadKubeConfig({} as any); // cheap way to get apis
        
        if (!this.namespace) {
            logger.error('Cannot cleanup, namespace is not set');
            return;
        }

        try {
            logger.info(`Cleaning up Kubernetes resources for ${deploymentName}...`);
            
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
            
            // Delete all Conda environment ConfigMaps for this deployment
            try {
                logger.info(`Cleaning up Conda ConfigMaps for deployment: ${deploymentName}`);
                
                // First, let's get all ConfigMaps in the namespace
                const allConfigMaps = await this.k8sApi.listNamespacedConfigMap({ 
                    namespace: this.namespace 
                });
                
                // Filter for ConfigMaps that belong to this deployment
                const condaConfigMaps = allConfigMaps.items.filter(cm => {
                    const labels = cm.metadata?.labels || {};
                    return labels['instance'] === deploymentName && labels['type'] === 'conda-environment';
                });
                
                if (condaConfigMaps.length > 0) {
                    logger.info(`Found ${condaConfigMaps.length} Conda ConfigMaps to delete`);
                    
                    // Delete each ConfigMap
                    for (const configMap of condaConfigMaps) {
                        try {
                            const name = configMap.metadata?.name;
                            if (name) {
                                await this.k8sApi.deleteNamespacedConfigMap({ 
                                    name: name, 
                                    namespace: this.namespace 
                                });
                                logger.info(`Deleted ConfigMap: ${name}`);
                            }
                        } catch (cmError: any) {
                            logger.warn(`Failed to delete ConfigMap: ${cmError.message}`);
                        }
                    }
                } else {
                    logger.info('No Conda ConfigMaps found to delete');
                }
            } catch (error: any) {
                logger.warn(`Failed to list/delete Conda ConfigMaps: ${error.message}`);
                // Don't throw, this is not critical
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