import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any APIs you want to expose to the renderer process here
  platform: process.platform,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  
  // Git configuration APIs
  git: {
    getGlobalConfig: () => ipcRenderer.invoke('git:getGlobalConfig'),
    detectSSHKeys: () => ipcRenderer.invoke('git:detectSSHKeys'),
    readSSHKey: (keyPath: string) => ipcRenderer.invoke('git:readSSHKey', keyPath),
    openSSHKeyDialog: () => ipcRenderer.invoke('dialog:openSSHKey'),
  },
  
  // Kubeconfig APIs
  kubeconfig: {
    detect: () => ipcRenderer.invoke('kubeconfig:detect'),
  },
  
  // Logger APIs
  logger: {
    info: (...args: any[]) => ipcRenderer.send('log', 'info', ...args),
    warn: (...args: any[]) => ipcRenderer.send('log', 'warn', ...args),
    error: (...args: any[]) => ipcRenderer.send('log', 'error', ...args),
    debug: (...args: any[]) => ipcRenderer.send('log', 'debug', ...args),
  },
  
  // Configuration APIs
  config: {
    getConfig: () => ipcRenderer.invoke('config:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('config:setConfig', config),
    getSection: (section: string) => ipcRenderer.invoke('config:getSection', section),
    setSection: (section: string, value: any) => ipcRenderer.invoke('config:setSection', section, value),
    getValue: (section: string, key: string) => ipcRenderer.invoke('config:getValue', section, key),
    setValue: (section: string, key: string, value: any) => ipcRenderer.invoke('config:setValue', section, key, value),
    reset: () => ipcRenderer.invoke('config:reset'),
    resetSection: (section: string) => ipcRenderer.invoke('config:resetSection', section),
    hasConfig: () => ipcRenderer.invoke('config:hasConfig'),
    getConfigPath: () => ipcRenderer.invoke('config:getConfigPath'),
    exportConfig: () => ipcRenderer.invoke('config:exportConfig'),
    importConfig: (configJson: string) => ipcRenderer.invoke('config:importConfig', configJson),
    validateConfig: (config: any) => ipcRenderer.invoke('config:validateConfig', config),
    getConfigSummary: () => ipcRenderer.invoke('config:getConfigSummary'),
  },
  
  // Kubernetes APIs
  kubernetes: {
    validateConnection: (kubeConfigPath: string) => ipcRenderer.invoke('kubernetes:validateConnection', kubeConfigPath),
    deploySecrets: (config: any) => ipcRenderer.invoke('kubernetes:deploySecrets', config),
    createJupyterLabPod: (config: any) => ipcRenderer.invoke('kubernetes:createJupyterLabPod', config),
    getPodStatus: (podName: string) => ipcRenderer.invoke('kubernetes:getPodStatus', podName),
    waitForPodReady: (podName: string, timeoutMs?: number) => ipcRenderer.invoke('kubernetes:waitForPodReady', podName, timeoutMs),
    deployJupyterLab: (config: any) => ipcRenderer.invoke('kubernetes:deployJupyterLab', config),
    cleanupJupyterLab: (podName: string) => ipcRenderer.invoke('kubernetes:cleanupJupyterLab', podName),
    listAvailableNamespaces: () => ipcRenderer.invoke('kubernetes:listAvailableNamespaces'),
    detectDefaultNamespace: () => ipcRenderer.invoke('kubernetes:detectDefaultNamespace'),
    validateNamespace: (namespace: string) => ipcRenderer.invoke('kubernetes:validateNamespace', namespace),
    // Port forwarding APIs
    startPortForward: (podName: string, localPort?: number, remotePort?: number) => ipcRenderer.invoke('kubernetes:startPortForward', podName, localPort, remotePort),
    stopPortForward: () => ipcRenderer.invoke('kubernetes:stopPortForward'),
    getPortForwardStatus: () => ipcRenderer.invoke('kubernetes:getPortForwardStatus'),
    // Fast reconnection API
    fastReconnectToPod: (podName: string) => ipcRenderer.invoke('kubernetes:fastReconnectToPod', podName),
  }
}); 