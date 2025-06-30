export interface CondaEnvironment {
  id: string
  name: string
  content: string
  fileName?: string
}

export interface SSHKeyInfo {
  path: string;
  content?: string;
  tag?: string;
}

export interface GitConfig {
  username: string
  email: string
  sshKeyPath: string
  sshKeyContent?: string
  sshKeyTag?: string
  enableSSHKeyDeployment?: boolean
  sshKeyDeploymentValidated?: boolean
}

export interface PvcConfig {
  name: string
  mountPath?: string
}

export interface HardwareConfig {
  cpu: string
  memory: string
  gpu: string
  gpuCount: number
  pvcs: PvcConfig[]
}

export interface KubernetesConfig {
  kubeConfigPath: string
  namespace?: string
}

export interface EnvironmentConfig {
  condaEnvironments: CondaEnvironment[]
}

export interface AppConfig {
  hardware: HardwareConfig
  kubernetes: KubernetesConfig
  git: GitConfig
  environment: EnvironmentConfig
  deployment?: {
    enableGitIntegration: boolean
    sshKeySecretName?: string
  }
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

export type AppPage = 'configurations' | 'loading' | 'jupyterlab'

export interface AppState {
  currentPage: AppPage
  config: AppConfig | null
  podStatus: PodStatus | null
  error: string | null
  isLoading: boolean
}

// Types shared between main and renderer
export type DeploymentPhase =
  | 'initializing'
  | 'validating-connection'
  | 'creating-manifests'
  | 'applying-manifests'
  | 'waiting-for-pod'
  | 'pod-ready'
  | 'setting-up-access'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface DeploymentProgress {
  phase: DeploymentPhase;
  message: string;
  progress: number;
  podName?: string;
  podStatus?: any;
  jupyterUrl?: string;
  error?: string;
}

export interface GitGlobalConfig {
  username: string;
  email: string;
}

export interface AppKubeConfig {
  kubeConfigPath: string | null
  currentContext: string | null
  namespace: string | null
  availableNamespaces: string[]
}

// This represents the state saved on the electron side
export interface ElectronAppState {
  condaConfig: { environments: CondaEnvironment[] }
  gitConfig: { 
    globalConfig: GitGlobalConfig;
    sshKeys: SSHKeyInfo[];
  };
  kubeConfig: AppKubeConfig;
  hardwareConfig: HardwareConfig;
}
