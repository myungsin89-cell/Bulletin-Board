const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const { autoUpdater } = require('electron-updater');

// Disable hardware acceleration to prevent GPU crashes in sandboxed/virtual environments
app.disableHardwareAcceleration();

// Configure Auto Updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  console.log('AutoUpdater: update available', info.version);
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: '동학년 게시판 업데이트 안내',
    message: `동학년 게시판의 새로운 버전(${info.version})이 성공적으로 다운로드되었습니다!\n지금 재시작하여 새로운 기능을 적용하시겠습니까?`,
    buttons: ['지금 재시작', '나중에']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// Handle Squirrel installer events (shortcut creation, uninstallation, etc.)
if (handleSquirrelEvent()) {
  return;
}

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false;
  }

  const ChildProcess = require('child_process');

  const appFolder = path.resolve(process.execPath, '..');
  const rootAtomFolder = path.resolve(appFolder, '..');
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
  const exeName = path.basename(process.execPath);

  const spawn = function(command, args) {
    let spawnedProcess;
    try {
      spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
    } catch (e) {}
    return spawnedProcess;
  };

  const spawnUpdate = function(args) {
    return spawn(updateDotExe, args);
  };

  const squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Install desktop and start menu shortcuts
      spawnUpdate(['--createShortcut', exeName]);
      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-uninstall':
      // Remove shortcuts
      spawnUpdate(['--removeShortcut', exeName]);
      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-obsolete':
      app.quit();
      return true;
  }
  return false;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Hide the default menu bar for a cleaner premium feel
  mainWindow.setMenuBarVisibility(false);

  // Check if we are running in development mode
  const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch((err) => {
      console.error('Failed to load dev server, retrying in 2 seconds...', err);
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
      }, 2000);
    });
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Log loading failures and crashes
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Renderer failed to load:', errorCode, errorDescription);
  });
  
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Main process uncaught exception:', err);
});

app.whenReady().then(() => {
  // IPC Handlers
  ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '취합할 로컬 폴더 선택',
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle('shell:open-folder', async (event, folderPath) => {
    if (!folderPath) return false;
    try {
      const err = await shell.openPath(folderPath);
      if (err) {
        console.error('Shell openPath error:', err);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to open folder path:', err);
      return false;
    }
  });

  ipcMain.handle('shell:open-external', async (event, url) => {
    if (!url) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.error('Failed to open external url:', err);
      return false;
    }
  });

  ipcMain.handle('config:save-embedded', async (event, config) => {
    // Save to firebase-applet-config.json in the project root/dist
    const configPath = path.join(app.getAppPath(), 'firebase-applet-config.json');
    try {
      await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      // Also try to save to dist directory if it exists (for active build target)
      const distConfigPath = path.join(app.getAppPath(), 'dist', 'firebase-applet-config.json');
      if (fs.existsSync(path.dirname(distConfigPath))) {
        await fsPromises.writeFile(distConfigPath, JSON.stringify(config, null, 2), 'utf8');
      }
      return true;
    } catch (err) {
      console.error('Failed to save embedded config:', err);
      return false;
    }
  });

  ipcMain.handle('file:save', async (event, { folderPath, fileName, arrayBuffer }) => {
    try {
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const fullPath = path.join(folderPath, fileName);
      const buffer = Buffer.from(arrayBuffer);
      await fsPromises.writeFile(fullPath, buffer);
      return true;
    } catch (err) {
      console.error('Failed to save file via IPC:', err);
      return false;
    }
  });

  const activeStreams = new Map();

  ipcMain.handle('file:start-write', async (event, roomId, teacherId, folderPath, fileName) => {
    const key = `${roomId}_${teacherId}`;
    try {
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const filePath = path.join(folderPath, fileName);
      const writeStream = fs.createWriteStream(filePath);
      activeStreams.set(key, writeStream);
      return true;
    } catch (err) {
      console.error('Failed to start file stream:', err);
      return false;
    }
  });

  ipcMain.handle('file:write-chunk', async (event, roomId, teacherId, arrayBuffer) => {
    const key = `${roomId}_${teacherId}`;
    const stream = activeStreams.get(key);
    if (!stream) return false;
    
    return new Promise((resolve) => {
      const buffer = Buffer.from(arrayBuffer);
      const needsDrain = !stream.write(buffer);
      if (needsDrain) {
        stream.once('drain', () => resolve(true));
      } else {
        resolve(true);
      }
    });
  });

  ipcMain.handle('file:close-write', async (event, roomId, teacherId, abort) => {
    const key = `${roomId}_${teacherId}`;
    const stream = activeStreams.get(key);
    if (!stream) return false;

    activeStreams.delete(key);
    
    return new Promise((resolve) => {
      stream.end(() => {
        if (abort) {
          fs.unlink(stream.path, () => resolve(true));
        } else {
          resolve(true);
        }
      });
    });
  });

  createWindow();

  // Trigger silent check for updates in production environment
  const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.warn('AutoUpdater check warning:', err);
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
