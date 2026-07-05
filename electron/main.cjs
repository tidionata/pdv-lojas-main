const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Fix cache collision / permission denied error
const userDataPath = path.join(app.getPath('appData'), 'PDVLojasDev');
app.setPath('userData', userDataPath);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'PDV Lojas',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  ipcMain.handle('get-printers', async () => {
    return await win.webContents.getPrintersAsync();
  });

  ipcMain.handle('print-html', async (event, { html, printer, silent }) => {
    const hiddenWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    
    hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    
    return new Promise((resolve, reject) => {
      hiddenWin.webContents.on('did-finish-load', () => {
        hiddenWin.webContents.print({
          silent: silent === undefined ? true : silent,
          deviceName: printer || undefined,
          margins: { marginType: 'none' }
        }, (success, failureReason) => {
          hiddenWin.close();
          if (success) resolve(true);
          else reject(new Error(failureReason || 'Print failed'));
        });
      });
    });
  });

  win.loadURL('http://localhost:8081');
});
