import { PodStatus } from './app';

export interface SSHKeyInfo {
  path: string;
  type: string;
  exists: boolean;
  source: 'environment' | 'default' | null;
}

export interface GitGlobalConfig {
  username?: string;
  email?: string;
}

export interface KubeConfigDetection {
  found: boolean;
  path: string | null;
  source: 'environment' | 'default' | null;
}

export interface IElectronAPI {
  platform: string;
  openFileDialog: () => Promise<string | null>;
  git: {
    getGlobalConfig: () => Promise<GitGlobalConfig>;
    detectSSHKeys: () => Promise<SSHKeyInfo[]>;
    readSSHKey: (keyPath: string) => Promise<string>;
    openSSHKeyDialog: () => Promise<string | null>;
  };
  kubeconfig: {
    detect: () => Promise<KubeConfigDetection>;
  };
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };
  config: {
    getConfig: () => Promise<any>;
    setConfig: (config: any) => Promise<boolean>;
    getSection: (section: string) => Promise<any>;
    setSection: (section: string, value: any) => Promise<boolean>;
    getValue: (section: string, key: string) => Promise<any>;
    setValue: (section: string, key: string, value: any) => Promise<boolean>;
    reset: () => Promise<boolean>;
    resetSection: (section: string) => Promise<boolean>;
    hasConfig: () => Promise<boolean>;
    getConfigPath: () => Promise<string>;
    exportConfig: () => Promise<string>;
    importConfig: (configJson: string) => Promise<boolean>;
    validateConfig: (config: any) => Promise<{ valid: boolean; errors: string[] }>;
    getConfigSummary: () => Promise<string>;
  };
  kubernetes: {
    validateConnection: (kubeConfigPath: string) => Promise<boolean>;
    deploySecrets: (config: any) => Promise<boolean>;
    createJupyterLabPod: (config: any) => Promise<string>;
    getPodStatus: (podName: string) => Promise<PodStatus>;
    waitForPodReady: (podName: string, timeoutMs?: number) => Promise<PodStatus>;
    deployJupyterLab: (config: any) => Promise<{ podName: string; status: PodStatus }>;
    cleanupJupyterLab: (podName: string) => Promise<boolean>;
    listAvailableNamespaces: () => Promise<string[]>;
    detectDefaultNamespace: () => Promise<{ defaultNamespace: string | null, availableNamespaces: string[] }>;
    validateNamespace: (namespace: string) => Promise<{ 
      exists: boolean,
      error?: string
    }>;
    startPortForward: (podName: string, localPort?: number, remotePort?: number) => Promise<{ success: boolean; message: string; url?: string }>;
    stopPortForward: () => Promise<{ success: boolean; message: string }>;
    getPortForwardStatus: () => Promise<{ status: string; isActive: boolean }>;
    fastReconnectToPod: (podName: string) => Promise<{ success: boolean; message: string; url?: string }>;
  }
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 