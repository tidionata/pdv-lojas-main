const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ── Pasta de dados do usuário ──────────────────────────────────────────────────
const userDataPath = path.join(app.getPath('appData'), 'PDVTotal');
app.setPath('userData', userDataPath);

// ── Determina se está em modo desenvolvimento ──────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'PDV Total',
    // Ícone da janela (Windows taskbar)
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.openDevTools();

  // ── Carrega a URL correta dependendo do ambiente ─────────────────────────────
  if (isDev) {
    // Em desenvolvimento: carrega do servidor Vite
    win.loadURL('http://localhost:8081');
    win.webContents.openDevTools();
  } else {
    // Em produção (.exe): carrega os arquivos estáticos do build
    win.loadFile(path.join(__dirname, '../dist/index.html'));
    win.webContents.openDevTools();
  }

  // ── Remove menu padrão do Electron (deixa mais limpo) ─────────────────────
  win.removeMenu();

  // ── Impressão: Lista as impressoras disponíveis ──────────────────────────────
  ipcMain.handle('get-printers', async () => {
    return await win.webContents.getPrintersAsync();
  });

  // ── Impressão: Imprime um conteúdo HTML em uma impressora ────────────────────
  ipcMain.handle('print-html', async (event, { html, printer, silent }) => {
    const hiddenWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    return new Promise((resolve, reject) => {
      hiddenWin.webContents.on('did-finish-load', () => {
        hiddenWin.webContents.print(
          {
            silent: silent === undefined ? true : silent,
            deviceName: printer || undefined,
            margins: { marginType: 'none' },
          },
          (success, failureReason) => {
            hiddenWin.close();
            if (success) resolve(true);
            else reject(new Error(failureReason || 'Falha na impressão'));
          }
        );
      });
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
