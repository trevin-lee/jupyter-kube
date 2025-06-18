export interface CondaEnvironment {
  id: string
  name: string
  content: string
  fileName?: string
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
  mountPath: string
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
