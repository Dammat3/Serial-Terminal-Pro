'use strict';
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');

let win;
let store;
let SerialPort;
let Client;
let autoUpdater;  // electron-updater — caricato dinamicamente

const activePorts  = {};
const activeRemote = {};

function loadNativeModules() {
  try {
    const Store = require('electron-store');
    store = new Store({ name: 'serial-terminal-config' });
  } catch (e) { console.error('[Store]', e.message); store = null; }
  try {
    const sp = require('serialport');
    SerialPort = sp.SerialPort;
  } catch (e) { console.error('[SerialPort]', e.message, '\nEsegui: npm run rebuild'); SerialPort = null; }
  try {
    Client = require('ssh2').Client;
  } catch (e) { console.error('[ssh2]', e.message, '\nEsegui: npm install ssh2'); Client = null; }
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    // Non mostrare dialog automatici — gestiamo tutto nel renderer
    autoUpdater.autoDownload        = true;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch (e) { console.error('[electron-updater]', e.message, '\nEsegui: npm install electron-updater'); autoUpdater = null; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Serial Terminal Pro',
    show: false,
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
  // Fix cursore scomparso su Windows: impedisce che Electron nasconda il puntatore
  // quando xterm.js imposta cursor:none sul canvas interno
  win.webContents.on('cursor-changed', (_event, type) => {
    if (type === 'none') win.webContents.executeJavaScript(
      'document.body.style.cursor=""'
    ).catch(() => {});
  });
  win.on('closed', () => {
    Object.values(activePorts).forEach(p => { try { if (p?.isOpen) p.close(); } catch(_){} });
    win = null;
  });
}

app.whenReady().then(() => { loadNativeModules(); createWindow(); buildMenu(); setupAutoUpdater(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Auto-updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater) return;           // non installato
  if (!app.isPackaged) {              // in sviluppo non fare nulla
    console.log('[AutoUpdater] modalità sviluppo — skip');
    return;
  }

  // Controlla silenziosamente all'avvio (dopo 3 sec per non rallentare il boot)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);

  autoUpdater.on('update-available', info => {
    win?.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    win?.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', progress => {
    win?.webContents.send('update-progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', info => {
    win?.webContents.send('update-downloaded', info.version);
  });

  autoUpdater.on('error', err => {
    // Log silenzioso — non disturbare l'utente per errori di rete
    console.error('[AutoUpdater]', err.message);
  });
}

// ── Menu nativo ──────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Tasti Funzione F1–F12…',
          accelerator: 'CmdOrCtrl+K',
          click() { win?.webContents.send('open-fkey-modal'); },
        },
        {
          label: 'Riapri ultima scheda chiusa',
          accelerator: 'CmdOrCtrl+Shift+T',
          click() { win?.webContents.send('reopen-last-tab'); },
        },
        { type: 'separator' },
        {
          label: 'Carica configurazione…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            if (!win) return;
            const { filePaths, canceled } = await dialog.showOpenDialog(win, {
              title:       'Carica configurazione',
              buttonLabel: 'Carica',
              filters:     [{ name: 'Configurazione JSON', extensions: ['json'] }],
              properties:  ['openFile'],
            });
            if (canceled || !filePaths.length) return;
            try {
              const raw  = fs.readFileSync(filePaths[0], 'utf-8');
              const data = JSON.parse(raw);
              win.webContents.send('apply-config', data);
            } catch (e) {
              dialog.showErrorBox('Errore', `File non valido:\n${e.message}`);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Esci' },
      ],
    },
    {
      label: 'Modifica',
      submenu: [
        { role: 'undo',      label: 'Annulla' },
        { role: 'redo',      label: 'Ripristina' },
        { type: 'separator' },
        { role: 'cut',       label: 'Taglia' },
        { role: 'copy',      label: 'Copia' },
        { role: 'paste',     label: 'Incolla' },
        { role: 'selectAll', label: 'Seleziona tutto' },
      ],
    },
    {
      label: 'Visualizza',
      submenu: [
        { role: 'reload',          label: 'Ricarica' },
        { role: 'toggleDevTools',  label: 'Strumenti sviluppatore' },
        { type: 'separator' },
        {
          label:   'Barra tasti funzione',
          type:    'checkbox',
          checked: true,
          click(item) { win?.webContents.send('toggle-fkey-bar', item.checked); },
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
      ],
    },
    {
      label: '?',
      submenu: [
        {
          label: `Serial Terminal Pro  v${app.getVersion()}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Controlla aggiornamenti',
          click() {
            if (!app.isPackaged) {
              dialog.showMessageBox(win, { message: 'Modalità sviluppo: aggiornamenti disabilitati.' });
              return;
            }
            win?.webContents.send('update-checking');
            autoUpdater?.checkForUpdates().catch(err => {
              dialog.showErrorBox('Aggiornamento', `Impossibile controllare: ${err.message}`);
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Informazioni…',
          click() {
            dialog.showMessageBox(win, {
              type:    'info',
              title:   'Serial Terminal Pro',
              message: `Serial Terminal Pro\nVersione ${app.getVersion()}`,
              detail:  'Terminale seriale multi-porta con pulsanti programmabili, SSH, Telnet e timestamp UTC.\n\n© Drai',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lista porte ──────────────────────────────────────────────────────────────
ipcMain.handle('list-ports', async () => {
  if (!SerialPort) return { success: false, ports: [], error: 'SerialPort non caricato' };
  try { return { success: true, ports: await SerialPort.list() }; }
  catch (e) { return { success: false, ports: [], error: e.message }; }
});

// ── Connetti ─────────────────────────────────────────────────────────────────
ipcMain.handle('connect-port', async (event, { portId, portPath, options }) => {
  if (!SerialPort) return { success: false, error: 'SerialPort non disponibile' };
  if (activePorts[portId]?.isOpen) return { success: false, error: 'Porta già aperta' };
  return new Promise(resolve => {
    try {
      const port = new SerialPort({
        path: portPath,
        baudRate: options.baudRate || 9600,
        dataBits:  options.dataBits  || 8,
        parity:    options.parity    || 'none',
        stopBits:  options.stopBits  || 1,
        rtscts:    options.rtscts    || false,
        autoOpen: false,
      });
      port.open(err => {
        if (err) { resolve({ success: false, error: err.message }); return; }
        activePorts[portId] = port;
        port.on('data', chunk => {
          win?.webContents?.send('port-data', { portId, bytes: Array.from(chunk) });
        });
        port.on('close', () => {
          win?.webContents?.send('port-closed', { portId });
          delete activePorts[portId];
        });
        port.on('error', err => {
          win?.webContents?.send('port-error', { portId, error: err.message });
        });
        resolve({ success: true });
      });
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
});

// ── Disconnetti ──────────────────────────────────────────────────────────────
ipcMain.handle('disconnect-port', async (event, { portId }) => {
  const port = activePorts[portId];
  if (!port?.isOpen) return { success: false, error: 'Porta non aperta' };
  return new Promise(resolve => {
    port.close(err => {
      if (err) resolve({ success: false, error: err.message });
      else { delete activePorts[portId]; resolve({ success: true }); }
    });
  });
});

// ── Chiudi tutte le porte di una scheda ─────────────────────────────────────
ipcMain.handle('close-tab-ports', async (event, { tabId }) => {
  const prefix = tabId + ':';

  // Serial
  const serialIds = Object.keys(activePorts).filter(k => k.startsWith(prefix));
  await Promise.all(serialIds.map(id => new Promise(res => {
    const p = activePorts[id];
    if (p?.isOpen) p.close(() => { delete activePorts[id]; res(); });
    else res();
  })));

  // Remote (SSH / Telnet)
  const remoteIds = Object.keys(activeRemote).filter(k => k.startsWith(prefix));
  remoteIds.forEach(id => _closeRemote(id));

  return { success: true };
});

// ── SSH ───────────────────────────────────────────────────────────────────────
ipcMain.handle('connect-ssh', async (event, { portId, host, port, username, password, privateKey }) => {
  if (!Client) return { success: false, error: 'ssh2 non installato — esegui: npm install ssh2' };
  if (activeRemote[portId]) return { success: false, error: 'Già connesso' };

  return new Promise(resolve => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, stream) => {
        if (err) { conn.end(); return resolve({ success: false, error: err.message }); }

        activeRemote[portId] = { type: 'ssh', conn, stream };

        stream.on('data', chunk => {
          win?.webContents?.send('port-data', { portId, bytes: Array.from(chunk) });
        });

        stream.stderr.on('data', chunk => {
          win?.webContents?.send('port-data', { portId, bytes: Array.from(chunk) });
        });

        stream.on('close', () => {
          win?.webContents?.send('port-closed', { portId });
          delete activeRemote[portId];
        });

        resolve({ success: true });
      });
    });

    conn.on('error', err => {
      resolve({ success: false, error: err.message });
    });

    const authOpts = { host, port: port || 22, username, readyTimeout: 10000 };
    if (privateKey) {
      authOpts.privateKey = privateKey;
    } else {
      authOpts.password = password;
    }

    try { conn.connect(authOpts); }
    catch (e) { resolve({ success: false, error: e.message }); }
  });
});

// ── Telnet ────────────────────────────────────────────────────────────────────
ipcMain.handle('connect-telnet', async (event, { portId, host, port }) => {
  if (activeRemote[portId]) return { success: false, error: 'Già connesso' };

  return new Promise(resolve => {
    const socket = new net.Socket();
    let resolved = false;

    socket.connect(port || 23, host, () => {
      activeRemote[portId] = { type: 'telnet', conn: socket, stream: socket };

      socket.on('data', chunk => {
        // Filtra le opzioni Telnet (IAC = 0xFF) — risponde con WON'T/DON'T
        const filtered = _filterTelnetIAC(chunk, socket);
        if (filtered.length > 0) {
          win?.webContents?.send('port-data', { portId, bytes: Array.from(filtered) });
        }
      });

      socket.on('close', () => {
        win?.webContents?.send('port-closed', { portId });
        delete activeRemote[portId];
      });

      if (!resolved) { resolved = true; resolve({ success: true }); }
    });

    socket.on('error', err => {
      if (!resolved) { resolved = true; resolve({ success: false, error: err.message }); }
    });

    socket.setTimeout(10000, () => {
      if (!resolved) { resolved = true; socket.destroy(); resolve({ success: false, error: 'Timeout connessione' }); }
    });
  });
});

// ── Disconnetti connessione remota ────────────────────────────────────────────
ipcMain.handle('disconnect-remote', async (event, { portId }) => {
  _closeRemote(portId);
  return { success: true };
});

// ── Scrittura su connessione remota ───────────────────────────────────────────
ipcMain.handle('write-remote', async (event, { portId, bytes }) => {
  const r = activeRemote[portId];
  if (!r) return { success: false, error: 'Non connesso' };
  try {
    r.stream.write(Buffer.from(bytes));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Resize terminale SSH ──────────────────────────────────────────────────────
ipcMain.handle('resize-remote', (event, { portId, cols, rows }) => {
  const r = activeRemote[portId];
  if (r?.type === 'ssh' && r.stream?.setWindow) {
    r.stream.setWindow(rows, cols, 0, 0);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function _closeRemote(portId) {
  const r = activeRemote[portId];
  if (!r) return;
  try {
    if (r.type === 'ssh') r.conn.end();
    else r.conn.destroy();
  } catch (_) {}
  delete activeRemote[portId];
}

/** Filtra e risponde alle opzioni Telnet (IAC), restituisce solo i dati puri. */
function _filterTelnetIAC(chunk, socket) {
  const IAC=255, WILL=251, WONT=252, DO=253, DONT=254, SB=250, SE=240;
  const out = [];
  let i = 0;
  while (i < chunk.length) {
    if (chunk[i] !== IAC) { out.push(chunk[i++]); continue; }
    i++; // skip IAC
    if (i >= chunk.length) break;
    const cmd = chunk[i++];
    if (cmd === WILL || cmd === DO) {
      // Risponde DONT/WONT a tutto per semplicità
      const reply = cmd === WILL ? DONT : WONT;
      socket.write(Buffer.from([IAC, reply, chunk[i] ?? 0]));
      i++;
    } else if (cmd === WONT || cmd === DONT) {
      i++; // skip option
    } else if (cmd === SB) {
      // Salta sub-negotiation fino a IAC SE
      while (i < chunk.length - 1 && !(chunk[i] === IAC && chunk[i+1] === SE)) i++;
      i += 2;
    }
    // altri comandi: ignora
  }
  return Buffer.from(out);
}

// ── Scrittura ────────────────────────────────────────────────────────────────
ipcMain.handle('write-port', async (event, { portId, bytes }) => {
  const port = activePorts[portId];
  if (!port?.isOpen) return { success: false, error: 'Porta non connessa' };
  return new Promise(resolve => {
    port.write(Buffer.from(bytes), err => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true });
    });
  });
});

// ── Config ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => {
  if (!store) return null;
  return store.get('appConfig', null);
});
ipcMain.handle('save-config', (_, cfg) => {
  if (store) store.set('appConfig', cfg);
  return true;
});

// ── Log su file ──────────────────────────────────────────────────────────────
ipcMain.handle('append-log', (_, { name, text }) => {
  try {
    const logsDir = path.join(app.getPath('documents'), 'SerialTerminalPro', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const file = path.join(logsDir, name.endsWith('.txt') ? name : `${name}.txt`);
    fs.appendFileSync(file, text, 'utf-8');
    return { success: true, file };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-log-dir', () => {
  return path.join(app.getPath('documents'), 'SerialTerminalPro', 'logs');
});

ipcMain.handle('open-log-folder', () => {
  const logsDir = path.join(app.getPath('documents'), 'SerialTerminalPro', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  require('electron').shell.openPath(logsDir);
  return true;
});
// Nota: il menu invia 'apply-config' direttamente via webContents.send,
// quindi questo handler non è necessario — rimane come alternativa
// per chiamate future via ipcRenderer.invoke se servisse.
ipcMain.handle('load-config-from-file', async () => {
  if (!win) return null;
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title:       'Carica configurazione',
    buttonLabel: 'Carica',
    filters:     [{ name: 'Configurazione JSON', extensions: ['json'] }],
    properties:  ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  try {
    return JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
  } catch (e) {
    return null;
  }
});

// ── Update IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('install-update', () => {
  autoUpdater?.quitAndInstall(false, true);
});

ipcMain.handle('check-for-updates-manual', async () => {
  if (!app.isPackaged) return { dev: true };
  try {
    await autoUpdater?.checkForUpdates();
    return { checking: true };
  } catch (e) {
    return { error: e.message };
  }
});
