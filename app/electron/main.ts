import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { configService } from './config';
import { kubernetesMainService } from './kubernetes-service';
import { logger } from './logging-service';

const isDev = process.env.IS_DEV === 'true';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  // Don't create multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    show: false, // Don't show until ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow iframe to load localhost content (JupyterLab)
      allowRunningInsecureContent: true, // Allow mixed content for development
    },
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      if (isDev) {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app.
  if (isDev) {
    // Try multiple ports in case the default is in use
    const tryPorts = [5173, 5174, 5175, 5176];
    let loaded = false;
    
    for (const port of tryPorts) {
      try {
        await mainWindow.loadURL(`http://localhost:${port}`);
        logger.info(`Successfully loaded from port ${port}`);
        loaded = true;
        break;
      } catch (err) {
        logger.warn(`Port ${port} not available, trying next...`);
      }
    }
    
    if (!loaded) {
      logger.error('Failed to load development URL from any port');
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch((err) => {
      logger.error('Failed to load production file:', err);
    });
  }
}

// Logging IPC handler
ipcMain.on('log', (_, level: 'info' | 'warn' | 'error' | 'debug', ...args) => {
  logger.logFromRenderer(level, ...args);
});

// IPC handlers
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Kube Config', extensions: ['yaml', 'yml', 'config'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// Git configuration IPC handlers
ipcMain.handle('git:getGlobalConfig', async () => {
  try {
    const { execSync } = require('child_process');
    
    let username: string | undefined;
    let email: string | undefined;
    
    try {
      username = execSync('git config --global user.name', { encoding: 'utf8' }).trim();
    } catch (e) {
      // Ignore if not set
    }
    
    try {
      email = execSync('git config --global user.email', { encoding: 'utf8' }).trim();
    } catch (e) {
      // Ignore if not set
    }
    
    return { username, email };
  } catch (error) {
    logger.error('Error reading git config:', error);
    return {};
  }
});

ipcMain.handle('git:detectSSHKeys', async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  const DEFAULT_SSH_KEY_PATHS = [
    '~/.ssh/id_rsa',
    '~/.ssh/id_ed25519',
    '~/.ssh/id_ecdsa',
    '~/.ssh/id_dsa',
    '~/.ssh/github_rsa',
    '~/.ssh/gitlab_rsa'
  ];
  
  function expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }
  
  function checkSSHKey(keyPath: string) {
    const expandedPath = expandPath(keyPath);
    const exists = fs.existsSync(expandedPath);
    
    let type = 'unknown';
    if (keyPath.includes('ed25519')) type = 'ED25519';
    else if (keyPath.includes('rsa')) type = 'RSA';
    else if (keyPath.includes('ecdsa')) type = 'ECDSA';
    else if (keyPath.includes('dsa')) type = 'DSA';
    
    return {
      path: keyPath,
      type,
      exists
    };
  }
  
  return DEFAULT_SSH_KEY_PATHS.map(checkSSHKey);
});

ipcMain.handle('git:readSSHKey', async (_, keyPath: string) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  function expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }
  
  try {
    const expandedPath = expandPath(keyPath);
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`SSH key not found at ${expandedPath}`);
    }
    return fs.readFileSync(expandedPath, 'utf8');
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('dialog:openSSHKey', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'SSH Keys', extensions: ['pub', 'pem', 'key'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// Kubeconfig detection IPC handlers
ipcMain.handle('kubeconfig:detect', async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  const COMMON_KUBECONFIG_PATHS = [
    '~/.kube/config',
    '/etc/kubernetes/admin.conf',
    '~/.kube/config.yaml'
  ];
  
  function expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }
  
  // Check KUBECONFIG environment variable first
  const kubeconfigEnv = process.env.KUBECONFIG;
  if (kubeconfigEnv) {
    const separator = process.platform === 'win32' ? ';' : ':';
    const paths = kubeconfigEnv.split(separator);
    
    for (const envPath of paths) {
      if (envPath.trim()) {
        const expandedPath = expandPath(envPath.trim());
        if (fs.existsSync(expandedPath)) {
          return {
            found: true,
            path: envPath.trim(),
            source: 'environment'
          };
        }
      }
    }
  }
  
  // Check common locations
  for (const commonPath of COMMON_KUBECONFIG_PATHS) {
    const expandedPath = expandPath(commonPath);
    if (fs.existsSync(expandedPath)) {
      return {
        found: true,
        path: commonPath,
        source: 'default'
      };
    }
  }
  
  return {
    found: false,
    path: null,
    source: null
  };
});

// Configuration IPC handlers
ipcMain.handle('config:getConfig', async () => {
  try {
    return configService.getConfig();
  } catch (error) {
    logger.error('Error getting config:', error);
    throw error;
  }
});

ipcMain.handle('config:setConfig', async (_, config) => {
  try {
    configService.setConfig(config);
    return true;
  } catch (error) {
    logger.error('Error setting config:', error);
    throw error;
  }
});

ipcMain.handle('config:getSection', async (_, section) => {
  try {
    return configService.getSection(section);
  } catch (error) {
    logger.error('Error getting config section:', error);
    throw error;
  }
});

ipcMain.handle('config:setSection', async (_, section, value) => {
  try {
    configService.setSection(section, value);
    return true;
  } catch (error) {
    logger.error('Error setting config section:', error);
    throw error;
  }
});

ipcMain.handle('config:getValue', async (_, section, key) => {
  try {
    return configService.getValue(section, key);
  } catch (error) {
    logger.error('Error getting config value:', error);
    throw error;
  }
});

ipcMain.handle('config:setValue', async (_, section, key, value) => {
  try {
    configService.setValue(section, key, value);
    return true;
  } catch (error) {
    logger.error('Error setting config value:', error);
    throw error;
  }
});

ipcMain.handle('config:reset', async () => {
  try {
    configService.reset();
    return true;
  } catch (error) {
    logger.error('Error resetting config:', error);
    throw error;
  }
});

ipcMain.handle('config:resetSection', async (_, section) => {
  try {
    configService.resetSection(section);
    return true;
  } catch (error) {
    logger.error('Error resetting config section:', error);
    throw error;
  }
});

ipcMain.handle('config:hasConfig', async () => {
  try {
    return configService.hasConfig();
  } catch (error) {
    logger.error('Error checking config existence:', error);
    throw error;
  }
});

ipcMain.handle('config:getConfigPath', async () => {
  try {
    return configService.getConfigPath();
  } catch (error) {
    logger.error('Error getting config path:', error);
    throw error;
  }
});

ipcMain.handle('config:exportConfig', async () => {
  try {
    return configService.exportConfig();
  } catch (error) {
    logger.error('Error exporting config:', error);
    throw error;
  }
});

ipcMain.handle('config:importConfig', async (_, configJson) => {
  try {
    configService.importConfig(configJson);
    return true;
  } catch (error) {
    logger.error('Error importing config:', error);
    throw error;
  }
});

ipcMain.handle('config:validateConfig', async (_, config) => {
  try {
    return configService.validateConfig(config);
  } catch (error) {
    logger.error('Error validating config:', error);
    throw error;
  }
});

ipcMain.handle('config:getConfigSummary', async () => {
  try {
    return configService.getConfigSummary();
  } catch (error) {
    logger.error('Error getting config summary:', error);
    throw error;
  }
});

// Kubernetes IPC handlers
ipcMain.handle('kubernetes:validateConnection', async (_, kubeConfigPath) => {
  try {
    return await kubernetesMainService.validateConnection(kubeConfigPath);
  } catch (error) {
    logger.error('Error validating Kubernetes connection:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:deploySecrets', async (_, config) => {
  try {
    await kubernetesMainService.deploySecrets(config);
    return true;
  } catch (error) {
    logger.error('Error deploying secrets:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:createJupyterLabPod', async (_, config) => {
  try {
    return await kubernetesMainService.createJupyterLabPod(config);
  } catch (error) {
    logger.error('Error creating JupyterLab pod:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:getPodStatus', async (_, podName) => {
  try {
    return await kubernetesMainService.getPodStatus(podName);
  } catch (error) {
    logger.error('Error getting pod status:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:waitForPodReady', async (_, podName, timeoutMs) => {
  try {
    return await kubernetesMainService.waitForPodReady(podName, timeoutMs);
  } catch (error) {
    logger.error('Error waiting for pod ready:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:deployJupyterLab', async (_, config) => {
  try {
    return await kubernetesMainService.deployJupyterLab(config);
  } catch (error) {
    logger.error('Error deploying JupyterLab:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:cleanupJupyterLab', async (_, podName) => {
  try {
    await kubernetesMainService.cleanupJupyterLab(podName);
    return true;
  } catch (error) {
    logger.error('Error cleaning up JupyterLab:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:listAvailableNamespaces', async () => {
  try {
    return await kubernetesMainService.listAvailableNamespaces();
  } catch (error) {
    logger.error('Error listing namespaces:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:detectDefaultNamespace', async () => {
  try {
    return await kubernetesMainService.detectDefaultNamespace();
  } catch (error) {
    logger.error('Error detecting default namespace:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:validateNamespace', async (_, namespace) => {
  try {
    return await kubernetesMainService.validateNamespace(namespace);
  } catch (error) {
    logger.error('Error validating namespace:', error);
    throw error;
  }
});

// Port forwarding IPC handlers
ipcMain.handle('kubernetes:startPortForward', async (_, podName, localPort, remotePort) => {
  try {
    return await kubernetesMainService.startPortForward(podName, localPort, remotePort);
  } catch (error) {
    logger.error('Error starting port forwarding:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:stopPortForward', async () => {
  try {
    return await kubernetesMainService.stopPortForward();
  } catch (error) {
    logger.error('Error stopping port forwarding:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:getPortForwardStatus', async () => {
  try {
    return kubernetesMainService.getPortForwardStatus();
  } catch (error) {
    logger.error('Error getting port forward status:', error);
    throw error;
  }
});

ipcMain.handle('kubernetes:fastReconnectToPod', async (_, podName) => {
  try {
    return await kubernetesMainService.fastReconnectToPod(podName);
  } catch (error) {
    logger.error('Error in fast reconnection:', error);
    throw error;
  }
});

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  app.whenReady().then(async () => {
    await createWindow();

    app.on('activate', async function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  });
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation (except for JupyterLab)
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Allow opening JupyterLab localhost URLs
    if (url.startsWith('http://localhost:8888') || url.startsWith('http://127.0.0.1:8888')) {
      logger.info('Allowing JupyterLab window creation to:', url);
      return { action: 'allow' };
    }
    
    logger.warn('Blocked new window creation to:', url);
    return { action: 'deny' };
  });
});