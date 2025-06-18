export interface SSHKeyInfo {
  path: string;
  type: string;
  exists: boolean;
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
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 