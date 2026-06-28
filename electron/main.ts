import { app, BrowserWindow, ipcMain, dialog, session, screen, Menu, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// Em dev, o Electron herda o stdout do processo-pai (launcher). Se esse pipe
// quebra (pai encerrado), qualquer write em stdout/stderr — inclusive um aviso
// do Node — lança EPIPE e derrubaria o main com "uncaught exception". Ignoramos.
process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code !== 'EPIPE') throw e; });
process.stderr.on('error', (e: NodeJS.ErrnoException) => { if (e.code !== 'EPIPE') throw e; });
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE') return;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'voltz-diag.log'), `[${new Date().toISOString()}] uncaught ${err?.stack ?? err}\n`); } catch { /* ignore */ }
});
import { registerPtyIpc, killAllPtys } from './ipc/pty';
import { registerProjectsIpc } from './ipc/projects';
import { registerClaudeIpc } from './ipc/claude';
import { registerStoreIpc } from './ipc/store';
import { registerClipboardIpc } from './ipc/clipboard';
import { registerTranscribeIpc } from './ipc/transcribe';
import { registerDevServerIpc } from './ipc/devServer';
import { registerDevPortsIpc } from './ipc/devPorts';
import { registerProjectMemoryIpc } from './ipc/projectMemory';
import { registerSkillsIpc } from './ipc/skills';
import { registerFilesIpc } from './ipc/files';
import { registerGitIpc } from './ipc/git';
import { registerGithubIpc } from './ipc/github';
import { registerSystemIpc } from './ipc/system';
import { startProcMonitor } from './ipc/procMonitor';
import { killAllDevServers } from './services/devServerManager';
import { initAutoUpdate } from './services/autoUpdate';
import { TelegramBridge } from './services/remote/telegramBridge';
import { appendRemoteHistory } from './services/remote/history';
import { registerRemoteIpc } from './ipc/remote';

const isDev = process.env.NODE_ENV === 'development';

// Habilita a Document Picture-in-Picture API (mesma usada pelo Google Meet),
// para podermos destacar painéis (ex.: Tarefas) numa janela flutuante.
app.commandLine.appendSwitch('enable-features', 'DocumentPictureInPictureAPI');


// Windows uses the AppUserModelID to:
//   - group instances under one taskbar icon
//   - resolve the right icon in the Start Menu / Action Center
//   - identify pinned shortcuts
// Must MATCH the `appId` in electron-builder.yml or Windows treats the dev
// build and the installed build as different apps.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.cassiobona.voltzide');
}

let mainWindow: BrowserWindow | null = null;
let tasksPipWindow: BrowserWindow | null = null;
let remoteBridge: TelegramBridge | null = null;

// Log de diagnóstico (crashes de renderer/GPU, erros do renderer).
const DIAG_LOG = path.join(app.getPath('userData'), 'voltz-diag.log');
function diag(msg: string) {
  try { fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignore */ }
}
// Crash de processo filho (GPU, utility, etc.) — causa comum da tela preta.
app.on('child-process-gone', (_e, d) => {
  diag(`child-process-gone type=${d.type} reason=${d.reason} exitCode=${d.exitCode} name=${d.name ?? ''}`);
});

// ---- Posição/tamanho persistidos da janela flutuante de Tarefas (PiP) ----
const PIP_BOUNDS_FILE = path.join(app.getPath('userData'), 'pip-tasks-bounds.json');
interface WinBounds { x: number; y: number; width: number; height: number }

function loadPipBounds(): Partial<WinBounds> | null {
  try {
    const b = JSON.parse(fs.readFileSync(PIP_BOUNDS_FILE, 'utf8')) as WinBounds;
    if (typeof b.width !== 'number' || typeof b.height !== 'number') return null;
    // Só usa a posição se cair dentro de algum monitor (evita abrir fora da tela).
    if (typeof b.x === 'number' && typeof b.y === 'number') {
      const onScreen = screen.getAllDisplays().some((disp) => {
        const w = disp.workArea;
        return b.x! >= w.x - 40 && b.y! >= w.y - 40
          && b.x! < w.x + w.width - 40 && b.y! < w.y + w.height - 40;
      });
      if (!onScreen) return { width: b.width, height: b.height };
    }
    return b;
  } catch {
    return null;
  }
}

function savePipBounds() {
  if (!tasksPipWindow || tasksPipWindow.isDestroyed()) return;
  try {
    const b = tasksPipWindow.getBounds();
    fs.writeFileSync(PIP_BOUNDS_FILE, JSON.stringify(b));
  } catch { /* ignore */ }
}

/** Abre (ou foca) a janela flutuante de Tarefas — sempre no topo. */
function openTasksPipWindow() {
  if (tasksPipWindow && !tasksPipWindow.isDestroyed()) {
    tasksPipWindow.focus();
    return;
  }
  const saved = loadPipBounds();
  tasksPipWindow = new BrowserWindow({
    width: saved?.width ?? 380,
    height: saved?.height ?? 600,
    ...(typeof saved?.x === 'number' && typeof saved?.y === 'number' ? { x: saved.x, y: saved.y } : {}),
    minWidth: 280,
    minHeight: 320,
    title: 'Tarefas — Voltz IDE',
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#1a1815',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // Acima inclusive de apps em tela cheia.
  tasksPipWindow.setAlwaysOnTop(true, 'screen-saver');

  // Salva posição/tamanho ao mover/redimensionar (debounced) e ao fechar.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(savePipBounds, 400);
  };
  tasksPipWindow.on('moved', scheduleSave);
  tasksPipWindow.on('resized', scheduleSave);
  tasksPipWindow.on('close', savePipBounds);

  if (isDev) {
    void tasksPipWindow.loadURL('http://localhost:5173/#pip=tasks');
  } else {
    void tasksPipWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), { hash: 'pip=tasks' });
  }

  tasksPipWindow.on('closed', () => {
    tasksPipWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pip:closed');
  });
}

async function createWindow() {
  // Icon path — works in dev (../../build) and packaged builds (resources copy).
  const iconPath = path.join(__dirname, '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1815',
    title: 'Voltz IDE',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true, // enables the in-app <webview> browser pane
    },
  });

  function loadApp() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isDev) void mainWindow.loadURL('http://localhost:5173');
    else void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  // Diagnóstico anexado ANTES do load para capturar erros da carga inicial.
  let lastRecover = 0;
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    diag(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    if (now - lastRecover < 8000) return;
    lastRecover = now;
    loadApp();
  });
  mainWindow.webContents.on('unresponsive', () => diag('renderer unresponsive'));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return; // aborted (navegação trocada) — ignora
    diag(`did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // Só erros (nível 3) — logar tudo causa I/O síncrono demais e trava o app.
    if (level >= 3) diag(`console L${level}: ${message} @${sourceId}:${line}`);
  });
  // Sonda o estado do DOM após carregar — diz se o React montou.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents
      .executeJavaScript(`JSON.stringify({url:location.href,hasRoot:!!document.getElementById('root'),rootKids:(document.getElementById('root')||{children:[]}).children.length,bodyKids:document.body?document.body.children.length:-1})`)
      .then((info) => diag(`did-finish-load ${info}`))
      .catch((e) => diag(`exec-err ${e}`));
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  // Bulletproof keyboard shortcuts: intercept BEFORE renderer / xterm sees the event.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    const ctrl = input.control || input.meta;
    // Bloqueia RECARREGAR O APP — F5, Cmd+R e Cmd/Ctrl+Shift+R (force reload):
    // isso recarrega o renderer e ZERA todos os terminais/estado. O reload segue
    // valendo DENTRO do browser embutido (<webview>), que tem webContents próprio
    // e não passa por aqui. NÃO bloqueamos Ctrl+R puro de propósito — ele é a
    // busca reversa do histórico do terminal. (No macOS o menu padrão também é
    // trocado por um sem "Recarregar"; veja buildMacMenu.)
    if (k === 'f5' || (input.meta && k === 'r') || (ctrl && input.shift && k === 'r')) {
      event.preventDefault();
      return;
    }
    // DevTools — antes vinha do menu padrão (agora removido). F12 ou Ctrl+Shift+I.
    if (k === 'f12' || (ctrl && input.shift && k === 'i')) {
      event.preventDefault();
      mainWindow?.webContents.toggleDevTools();
      return;
    }
    if (!ctrl) return;
    let action: string | null = null;
    if (k === 'k' && !input.alt && !input.shift) {
      action = 'palette:toggle';
    } else if (k === 'p' && !input.alt && !input.shift) {
      action = 'quickopen:toggle';
    } else if (k === 'p' && !input.alt && input.shift) {
      action = 'palette:toggle';
    } else if (k === 'f' && input.shift && !input.alt) {
      action = 'search:toggle';
    } else if (k === 'a' && input.shift && !input.alt) {
      action = 'task:quickAdd';
    } else if (!input.shift && !input.alt && /^[1-9]$/.test(k)) {
      action = `goToTab:${Number(k) - 1}`;
    } else if (k === 't' && !input.shift) {
      action = 'workspace:newTab';
    } else if (k === ',') {
      action = 'settings:open';
    } else if (input.shift && k === '\\') {
      action = 'workspace:splitVertical';
    } else if (input.shift && k === '_') {
      action = 'workspace:splitHorizontal';
    }
    if (action) {
      event.preventDefault();
      mainWindow?.webContents.send('shortcut:invoke', action);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // DEV: captura periódica da janela para inspeção visual durante o desenvolvimento.
  if (isDev) {
    const capPath = path.join(app.getPath('temp'), 'voltz-live.png');
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.capturePage()
        .then((img) => { try { fs.writeFileSync(capPath, img.toPNG()); } catch { /* ignore */ } })
        .catch(() => {});
    }, 4000);
  }
}

function registerDialogIpc() {
  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Selecione uma pasta raiz de projetos',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('dialog:pickFile', async (_evt, opts?: { filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: opts?.filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

/**
 * Menu do macOS equivalente ao padrão, porém SEM "Recarregar"/"Forçar
 * recarregamento" (eles recarregam o renderer e zeram todos os terminais).
 * Usa os roles prontos do macOS (appMenu/editMenu/windowMenu) e uma aba
 * "Visualizar" própria — sem reload, mas com tela cheia, zoom e DevTools.
 */
function buildMacMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },   // Sobre · Serviços · Ocultar · Sair (Cmd+Q)
    { role: 'editMenu' },  // Desfazer/Refazer · Recortar/Copiar/Colar · Selecionar tudo
    {
      label: 'Visualizar',
      submenu: [
        // De propósito SEM { role: 'reload' } e { role: 'forceReload' }.
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' }, // Minimizar · Zoom · Trazer para frente
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(async () => {
  // Remove o menu padrão do Electron no Windows/Linux. Seus aceleradores
  // (undo=Ctrl+Z, selectAll=Ctrl+A, reload=Ctrl+R…) sequestravam essas teclas
  // ANTES do terminal, impedindo que chegassem ao shell. Sem o menu, Ctrl+Z
  // vira Undo do PSReadLine e Ctrl+R vira busca reversa de histórico, como num
  // terminal de verdade. O DevTools é reaberto via F12/Ctrl+Shift+I.
  // No macOS o menu usa Cmd (não Ctrl), então não há conflito — e removê-lo
  // tiraria convenções essenciais (Cmd+Q, Cmd+C/V); por isso mantemos lá.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  } else {
    // macOS: o menu é essencial (Cmd+Q, Cmd+C/V…), mas o menu PADRÃO traz
    // "Recarregar" (Cmd+R) e "Forçar recarregamento" (Cmd+Shift+R), que zeram
    // todos os terminais. Trocamos por um menu equivalente SEM esses itens.
    Menu.setApplicationMenu(buildMacMenu());
  }

  // Allow microphone for speech recognition
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') return callback(true);
    callback(false);
  });

  registerStoreIpc();
  registerClaudeIpc();
  registerClipboardIpc();
  registerTranscribeIpc();
  registerProjectsIpc();
  registerPtyIpc(() => mainWindow);
  registerDevServerIpc(() => mainWindow);
  registerDevPortsIpc();
  registerProjectMemoryIpc();
  registerSkillsIpc();
  registerFilesIpc();
  registerGitIpc();
  registerGithubIpc(() => mainWindow);
  registerSystemIpc();
  startProcMonitor(() => mainWindow);
  registerDialogIpc();
  // Registra os handlers de update ANTES de abrir a janela — senão o renderer
  // pode chamar 'updates:current' antes do handler existir. (Updater real é no-op em dev.)
  initAutoUpdate();

  remoteBridge = new TelegramBridge(
    () => {
      const win = mainWindow;
      if (win && !win.webContents.isDestroyed()) win.webContents.send('remote:status', remoteBridge!.status());
    },
    (e) => {
      appendRemoteHistory(e); // persiste para o histórico por projeto
      const win = mainWindow;
      if (win && !win.webContents.isDestroyed()) win.webContents.send('remote:activity', e);
    },
  );
  registerRemoteIpc(() => remoteBridge!, () => mainWindow);
  void remoteBridge.start(); // só sobe se enabled+token na config

  ipcMain.handle('browser:clearCache', async () => {
    try {
      const sess = session.fromPartition('persist:voltz-browser');
      await sess.clearCache();
      await sess.clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'serviceworkers', 'indexdb'] });
    } catch { /* ignore */ }
    return { ok: true };
  });

  ipcMain.handle('pip:openTasks', () => {
    openTasksPipWindow();
    return { ok: true };
  });
  ipcMain.handle('pip:closeTasks', () => {
    if (tasksPipWindow && !tasksPipWindow.isDestroyed()) tasksPipWindow.close();
  });
  // Pedido (vindo da janela flutuante) para abrir um projeto na janela principal.
  ipcMain.handle('window:openProjectInMain', (_evt, name: string, projectPath: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('open-project', name, projectPath);
    }
  });
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  remoteBridge?.stop();
  killAllPtys();
  killAllDevServers();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  remoteBridge?.stop();
  killAllPtys();
  killAllDevServers();
});
