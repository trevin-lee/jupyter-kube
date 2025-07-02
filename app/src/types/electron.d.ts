import { GitGlobalConfig, SSHKeyInfo, AppKubeConfig, DeploymentProgress, ElectronAppState, HardwareConfig, CondaEnvironment } from './app';

export interface IElectronAPI {
  platform: string;
  
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };

  getFullConfig: () => Promise<ElectronAppState>;
  saveState: () => void;

  hardwareConfig: {
    update: (config: HardwareConfig) => Promise<boolean>;
  };

  environmentConfig: {
    update: (environments: CondaEnvironment[]) => Promise<boolean>;
    addFromFile: (filePath: string) => Promise<CondaEnvironment | null>;
    remove: (id: string) => Promise<boolean>;
  };

  gitConfig: {
    detect: () => Promise<GitGlobalConfig>;
    detectSSHKeys: () => Promise<SSHKeyInfo[]>;
    update: (gitConfig: any) => Promise<boolean>;
    openSSHKeyDialog: () => Promise<string | null>;
    readSSHKey: (keyPath: string) => Promise<string>;
    extractSSHKeyTag: (content: string) => Promise<string>;
  };

  kubeConfig: {
    detect: () => Promise<AppKubeConfig>;
    detectNamespaces: () => Promise<{namespace: string | null, availableNamespaces: string[]}>;
    update: (namespace: string | null) => Promise<boolean>;
    updatePath: (kubeConfigPath: string | null) => Promise<boolean>;
    selectFile: () => Promise<AppKubeConfig | null>;
  };

  kubernetes: {
    deploy: (config: ElectronAppState) => void;
    cleanup: (deploymentName: string) => void;
    cancel: () => void;
    onProgress: (callback: (event: any, progress: DeploymentProgress) => void) => () => void;
  };

  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 