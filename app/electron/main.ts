import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { logger } from './logging-service';
import { GitConfigManager } from './git-config';
import { KubeConfigManager } from './kube-config';
import { FormStateManager } from './form-state';
import { KubernetesService } from './kubernetes-service';
import { promises as fs } from 'fs';
import { SSHKeyInfo } from '../src/types/app';
import { CondaConfigManager } from './conda-config';

const isDev = process.env.IS_DEV === 'true';

let mainWindow: BrowserWindow | null = null;
let k8sService: KubernetesService | null = null;

// Initialize all managers
const formStateManager = FormStateManager.getInstance();
const gitManager = GitConfigManager.getInstance();
const kubeManager = KubeConfigManager.getInstance();
const condaManager = CondaConfigManager.getInstance();

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

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

  k8sService = new KubernetesService(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      if (isDev) {
        mainWindow.webContents.openDevTools();
      }
    }
  });

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

app.on('ready', async () => {
    // Load state from disk
    await formStateManager.loadState();

    createWindow();
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile']
    });
    if (!canceled) {
        return filePaths[0];
    }
});

// Global configuration
ipcMain.handle('app:getFullConfig', () => {
    return formStateManager.getFullConfig();
});

ipcMain.on('app:saveState', () => {
    formStateManager.saveState();
});

// Hardware configuration handlers
ipcMain.handle('hardware:update', (event, hardwareConfig) => {
    formStateManager.setHardwareConfig(hardwareConfig);
    return true;
});

// Environment configuration handlers
ipcMain.handle('environment:update', (event, environments) => {
    condaManager.setConfig({ environments });
    return true;
});

ipcMain.handle('environment:addFromFile', async (event, filePath) => {
    return await condaManager.addEnvironmentFromFile(filePath);
});

ipcMain.handle('environment:remove', (event, id) => {
    condaManager.removeEnvironment(id);
    return true;
});

// Git configuration handlers
ipcMain.handle('git:detect', () => gitManager.detectGitConfig());
ipcMain.handle('git:detectSSHKeys', () => gitManager.detectSSHKeys());
ipcMain.handle('git:readSSHKey', async (event, filePath) => {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
        logger.error(`Failed to read SSH key ${filePath}:`, e);
        throw e;
    }
});

ipcMain.handle('git:extractSSHKeyTag', async (event, content) => {
    return gitManager.extractSSHKeyTag(content);
});

ipcMain.handle('git:update', (event, gitConfig) => {
    // Update the Git configuration with SSH key data from UI
    if (gitConfig.sshKeyPath && gitConfig.sshKeyTag) {
        const sshKey: SSHKeyInfo = {
            path: gitConfig.sshKeyPath,
            content: gitConfig.sshKeyContent,
            tag: gitConfig.sshKeyTag
        };
        gitManager.setSshKeys([sshKey]);
    }
    gitManager.setGlobalConfig(gitConfig.username || '', gitConfig.email || '');
    return true;
});

// Kube configuration handlers
ipcMain.handle('kube:detect', () => kubeManager.autoDetectKubeConfig());

ipcMain.handle('kube:update', (event, namespace) => {
    const currentConfig = kubeManager.getConfig();
    kubeManager.setConfig({
        ...currentConfig,
        namespace: namespace
    });
    return true;
});

// Kubernetes deployment handlers
ipcMain.on('k8s:deploy', (event, config) => {
    if (!k8sService) return;
    k8sService.deployWithProgress(config);
});

ipcMain.on('k8s:cleanup', (event, deploymentName) => {
    if (!k8sService) return;
    k8sService.cleanupJupyterLab(deploymentName);
});

ipcMain.on('k8s:cancel', () => {
    if (!k8sService) return;
    k8sService.stopCurrentDeployment();
});