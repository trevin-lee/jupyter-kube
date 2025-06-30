// Provides a tiny wrapper around the main-process FormStateManager so the
// React renderer can load / save config without crashing when the preload
// bridge is not available (e.g. during storybook or tests).

import { AppConfig } from '../types/app'

const dummy: AppConfig = {
  hardware: {
    cpu: '',
    memory: '',
    gpu: 'none',
    gpuCount: 0,
    pvcs: [],
  },
  kubernetes: {
    kubeConfigPath: '',
    namespace: '',
  },
  git: {
    username: '',
    email: '',
    sshKeyPath: '',
    enableSSHKeyDeployment: true,
    sshKeyDeploymentValidated: false,
  },
  environment: { condaEnvironments: [] },
  deployment: { enableGitIntegration: true },
}

const hasBridge = typeof window !== 'undefined' && !!window.electronAPI

export async function getConfigWithAutoDetection(): Promise<AppConfig> {
  if (hasBridge) {
    const full = await window.electronAPI.getFullConfig()
    
    // Auto-detect git config if not already saved
    if (!full.gitConfig.globalConfig.username && !full.gitConfig.globalConfig.email) {
      const detectedGit = await window.electronAPI.gitConfig.detect()
      if (detectedGit) {
        full.gitConfig.globalConfig = detectedGit
      }
    }
    
    // Auto-detect SSH keys if none saved
    if (!full.gitConfig.sshKeys || full.gitConfig.sshKeys.length === 0) {
      const detectedKeys = await window.electronAPI.gitConfig.detectSSHKeys()
      if (detectedKeys && detectedKeys.length > 0) {
        full.gitConfig.sshKeys = detectedKeys
      }
    }
    
    // Auto-detect kubeconfig if not already saved
    if (!full.kubeConfig.kubeConfigPath) {
      const detectedKube = await window.electronAPI.kubeConfig.detect()
      if (detectedKube) {
        full.kubeConfig = detectedKube
      }
    }
    
    // Convert the persisted ElectronAppState shape to the renderer AppConfig shape
    const firstSshKey = full.gitConfig.sshKeys[0]
    return {
      hardware: full.hardwareConfig || {
        cpu: '',
        memory: '',
        gpu: 'none',
        gpuCount: 0,
        pvcs: [],
      },
      kubernetes: {
        kubeConfigPath: full.kubeConfig.kubeConfigPath || '',
        namespace: full.kubeConfig.namespace || '',
      },
      git: {
        username: full.gitConfig.globalConfig.username,
        email: full.gitConfig.globalConfig.email,
        sshKeyPath: firstSshKey?.path || '',
        sshKeyContent: firstSshKey?.content,
        sshKeyTag: firstSshKey?.tag,
        enableSSHKeyDeployment: true,
        sshKeyDeploymentValidated: false,
      },
      environment: { condaEnvironments: full.condaConfig.environments },
      deployment: { enableGitIntegration: true },
    }
  }
  return dummy
}

export function autoSave(config: AppConfig) {
  if (hasBridge) {
    // Update hardware configuration on the backend
    window.electronAPI.hardwareConfig.update(config.hardware);
    
    // Update conda environments on the backend
    if (config.environment && config.environment.condaEnvironments) {
      window.electronAPI.environmentConfig.update(config.environment.condaEnvironments);
    }
    
    // Update Git configuration on the backend before saving
    if (config.git) {
      window.electronAPI.gitConfig.update(config.git);
    }
    
    // Update Kube configuration namespace
    if (config.kubernetes && config.kubernetes.namespace) {
      window.electronAPI.kubeConfig.update(config.kubernetes.namespace);
    }
    
    window.electronAPI.saveState()
  }
} 