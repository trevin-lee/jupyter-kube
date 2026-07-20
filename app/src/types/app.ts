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
}

export interface PvcConfig {
  name: string
  mountPath?: string
}

export interface HardwareConfig {
  cpu: string
  memory: string
  /** Number of GPUs to request. 0 means no GPU. */
  gpuCount: number
  /**
   * Extended resource key the cluster advertises GPUs under.
   * Defaults to `nvidia.com/gpu`; AMD clusters use `amd.com/gpu`, etc.
   */
  gpuResourceKey?: string
  /**
   * Optional node-label targeting, for picking a specific GPU model.
   * Left blank, the pod requests a GPU without a nodeSelector and the
   * scheduler places it on any GPU node — which works on most clusters.
   * Key varies by cluster: `nvidia.com/gpu.product`, `cloud.google.com/gke-accelerator`, ...
   */
  gpuNodeLabelKey?: string
  gpuNodeLabelValue?: string
  pvcs: PvcConfig[]
}

export interface ContainerConfig {
  /**
   * Container image to run. Required — there is no default, since the image must
   * be reachable from your cluster. See docker/README.md for what it must provide.
   */
  image: string
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
  container: ContainerConfig
  kubernetes: KubernetesConfig
  git: GitConfig
  environment: EnvironmentConfig
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
  containerConfig: ContainerConfig;
}
