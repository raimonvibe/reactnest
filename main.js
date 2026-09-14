const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false, // Keep this false
    icon: path.join(__dirname, 'assets/icon.png'),
    // IMPORTANT: Set background to match your app's background
    backgroundColor: '#1e293b', // Match your splash screen background
    // Additional options to prevent flash
    webSecurity: true,
    backgroundThrottling: false
  });

  mainWindow.loadFile('index.html');

  // IMPROVED: Better timing for showing window
  mainWindow.once('ready-to-show', () => {
    // Add small delay to ensure everything is loaded
    setTimeout(() => {
      mainWindow.show();
      
      // Optional: Fade in effect
      mainWindow.setOpacity(0);
      mainWindow.show();
      
      // Gradually increase opacity
      let opacity = 0;
      const fadeIn = setInterval(() => {
        opacity += 0.05;
        mainWindow.setOpacity(opacity);
        if (opacity >= 1) {
          clearInterval(fadeIn);
        }
      }, 16); // ~60fps
      
    }, 100); // Small delay to ensure content is ready
    
    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window controls
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IMPROVED: Wait for app to be fully ready
// Disable GPU acceleration to prevent GPU process crashes
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Installation Directory'
  });
  
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('install-project', async (event, { projectName, folderPath, projectType }) => {
  return new Promise((resolve, reject) => {
    if (typeof projectName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(projectName)) {
      reject(new Error('Invalid project name'));
      return;
    }
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      reject(new Error('Invalid installation directory'));
      return;
    }

    const projectPath = path.join(folderPath, projectName);
    
    // Check if directory already exists
    if (fs.existsSync(projectPath)) {
      reject(new Error(`Directory "${projectName}" already exists!`));
      return;
    }

    let command;
    let args = [];

    switch (projectType) {
      case 'create-react-app':
        command = 'npx';
        args = ['create-react-app', projectName];
        break;
      case 'vite':
        command = 'npm';
        args = ['create', 'vite@latest', projectName, '--', '--template', 'react'];
        break;
      // case 'next':
      //   command = 'npx';
      //   args = ['create-next-app@latest', projectName, '--typescript', '--tailwind', '--eslint', '--app'];
      //   break;
      case 'next':
      command = 'npx';
      args = [
        'create-next-app@latest',
        projectName,
        '--yes',
        '--typescript',
        '--tailwind',
        '--eslint',
        '--app'
      ];
      break;

      // case 'remix':
      //   command = 'npx';
      //   args = ['create-remix@latest', projectName];
      //   break;
      default:
        reject(new Error('Unknown project type'));
        return;
    }

    const isWin = process.platform === 'win32';
    const executable = isWin ? `${command}.cmd` : command;
    const child = spawn(executable, args, {
      cwd: folderPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      // Send progress updates
      event.sender.send('install-progress', {
        type: 'stdout',
        data: data.toString()
      });
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      event.sender.send('install-progress', {
        type: 'stderr',
        data: data.toString()
      });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          path: projectPath,
          output: output
        });
      } else {
        reject(new Error(`Installation failed with code ${code}: ${errorOutput}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
});

// Copy to clipboard handler
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return { success: false, error: error.message };
  }
});

// Open external URL
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.showItemInFolder(folderPath);
});

ipcMain.handle('close-app', () => {
  app.quit();
});

ipcMain.handle('minimize-app', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-app', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});


// Example: during project installation
// Add these handlers to your main.js file

// System info handler
ipcMain.handle('get-system-info', async () => {
  const os = require('os');
  return {
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome
  };
});

// Default path handler
ipcMain.handle('get-default-path', async () => {
  const os = require('os');
  return path.join(os.homedir(), 'Desktop');
});

// Get platform handler
ipcMain.handle('get-platform', async () => {
  return process.platform;
});

// Open in editor handler
// ipcMain.handle('open-in-editor', async (event, projectPath) => {
//   try {
//     // Try VS Code first
//     const { spawn } = require('child_process');
    
//     return new Promise((resolve) => {
//       const code = spawn('code', [projectPath], { stdio: 'ignore' });
      
//       code.on('close', (exitCode) => {
//         if (exitCode === 0) {
//           resolve({ success: true, editor: 'VS Code' });
//         } else {
//           // Fallback to opening folder
//           shell.showItemInFolder(projectPath);
//           resolve({ success: true, editor: 'File Explorer' });
//         }
//       });
      
//       code.on('error', () => {
//         // Fallback to opening folder
//         shell.showItemInFolder(projectPath);
//         resolve({ success: true, editor: 'File Explorer' });
//       });
//     });
//   } catch (error) {
//     return { success: false, error: error.message };
//   }
// });
ipcMain.handle('open-in-editor', async (event, projectPath) => {
  try {
    return new Promise((resolve) => {
      // Try to open in VS Code
      const code = spawn(process.platform === 'win32' ? 'code.cmd' : 'code', [projectPath], {
        detached: true,
        stdio: 'ignore'
      });

      code.on('error', () => {
        // Fallback: open in file explorer
        shell.showItemInFolder(projectPath);
        resolve({ success: true, editor: 'File Explorer (fallback)' });
      });

      // If it starts successfully, we assume editor opened
      code.unref();
      resolve({ success: true, editor: 'VS Code' });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});