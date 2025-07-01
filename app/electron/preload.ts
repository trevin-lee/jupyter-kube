import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  
  // Logger APIs
  logger: {
    info: (...args: any[]) => ipcRenderer.send('log', 'info', ...args),
    warn: (...args: any[]) => ipcRenderer.send('log', 'warn', ...args),
    error: (...args: any[]) => ipcRenderer.send('log', 'error', ...args),
    debug: (...args: any[]) => ipcRenderer.send('log', 'debug', ...args),
  },

  // Global configuration management
  getFullConfig: () => ipcRenderer.invoke('app:getFullConfig'),
  saveState: () => ipcRenderer.send('app:saveState'),

  // Hardware configuration APIs
  hardwareConfig: {
    update: (config: any) => ipcRenderer.invoke('hardware:update', config),
  },

  // Environment configuration APIs
  environmentConfig: {
    update: (environments: any[]) => ipcRenderer.invoke('environment:update', environments),
    addFromFile: (filePath: string) => ipcRenderer.invoke('environment:addFromFile', filePath),
    remove: (id: string) => ipcRenderer.invoke('environment:remove', id),
  },

  // Git configuration APIs
  gitConfig: {
    detect: () => ipcRenderer.invoke('git:detect'),
    detectSSHKeys: () => ipcRenderer.invoke('git:detectSSHKeys'),
    update: (gitConfig: any) => ipcRenderer.invoke('git:update', gitConfig),
    openSSHKeyDialog: () => ipcRenderer.invoke('git:openSSHKeyDialog'),
    readSSHKey: (keyPath: string) => ipcRenderer.invoke('git:readSSHKey', keyPath),
    extractSSHKeyTag: (content: string) => ipcRenderer.invoke('git:extractSSHKeyTag', content),
  },

  // Kube configuration APIs
  kubeConfig: {
    detect: () => ipcRenderer.invoke('kube:detect'),
    update: (namespace: string | null) => ipcRenderer.invoke('kube:update', namespace),
  },

  // Kubernetes deployment APIs
  kubernetes: {
    deploy: (config: any) => ipcRenderer.send('k8s:deploy', config),
    cleanup: (deploymentName: string) => ipcRenderer.send('k8s:cleanup', deploymentName),
    cancel: () => ipcRenderer.send('k8s:cancel'),
    onProgress: (callback: (event: any, progress: any) => void) => {
        ipcRenderer.on('k8s-deployment-progress', callback);
        // Return a function to remove the listener
        return () => ipcRenderer.removeListener('k8s-deployment-progress', callback);
    }
  },

  // Open external URL in user's default browser
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
}); 