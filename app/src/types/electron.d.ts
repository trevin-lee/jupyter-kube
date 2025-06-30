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
    update: (namespace: string | null) => Promise<boolean>;
  };

  kubernetes: {
    deploy: (config: ElectronAppState) => void;
    cleanup: (deploymentName: string) => void;
    cancel: () => void;
    onProgress: (callback: (event: any, progress: DeploymentProgress) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 