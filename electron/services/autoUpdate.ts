import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../../shared/types';
import { macCheckForUpdates, macInstallUpdate } from './macUpdater';

const isMac = process.platform === 'darwin';

function log(msg: string) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'voltz-diag.log'), `[${new Date().toISOString()}] update: ${msg}\n`);
  } catch { /* ignore */ }
}

/** Envia o estado da atualização para todas as janelas (para a UI in-app). */
function broadcast(status: UpdateStatus) {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('updates:status', status); } catch { /* janela fechando */ }
  }
}

/**
 * Auto-update via electron-updater + GitHub Releases.
 *
 * Em produção: baixa a nova versão em segundo plano, emite os eventos para a UI
 * (banner in-app) e mostra também a notificação nativa. A instalação acontece
 * ao reiniciar (botão "Reiniciar para atualizar" ou ao fechar o app).
 *
 * No macOS (app não assinado) o Squirrel.Mac não pode instalar — usamos um
 * updater próprio (ver macUpdater.ts): checa o GitHub, baixa o .dmg e troca o
 * app sem assinatura, com fallback para abrir o instalador.
 */
export function initAutoUpdate() {
  // Handlers SEMPRE disponíveis (mesmo em dev) pra UI não quebrar ao chamá-los.
  ipcMain.handle('updates:current', () => ({ version: app.getVersion() }));

  ipcMain.handle('updates:check', () => {
    if (!app.isPackaged) { broadcast({ state: 'idle' }); return; }
    if (isMac) { void macCheckForUpdates(); return; }
    void autoUpdater.checkForUpdates().catch((e) => {
      log(`check failed ${e?.message ?? e}`);
      broadcast({ state: 'error', message: String(e?.message ?? e) });
    });
  });

  ipcMain.handle('updates:quitAndInstall', () => {
    if (!app.isPackaged) { log('quitAndInstall ignorado (dev)'); return; }
    if (isMac) { void macInstallUpdate(); return; }
    // setImmediate evita corrida com o IPC ainda respondendo.
    setImmediate(() => autoUpdater.quitAndInstall());
  });

  // Permite pré-visualizar o banner em dev (sem updater real).
  ipcMain.handle('updates:simulate', (_e, version: string) => {
    const v = version || '0.0.0';
    broadcast({ state: 'downloading', percent: 40, version: v });
    setTimeout(() => broadcast({ state: 'downloading', percent: 80, version: v }), 600);
    setTimeout(() => broadcast({ state: 'ready', version: v }), 1300);
  });

  if (!app.isPackaged) return; // updater real só no app empacotado

  // macOS: updater próprio (não há Squirrel.Mac sem assinatura).
  if (isMac) {
    const checkMac = () => { void macCheckForUpdates(); };
    setTimeout(checkMac, 8_000); // deixa o app abrir antes de checar
    setInterval(checkMac, 6 * 60 * 60 * 1000);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let pendingVersion: string | undefined;

  autoUpdater.on('error', (err) => {
    log(`error ${err?.message ?? err}`);
    broadcast({ state: 'error', message: String(err?.message ?? err) });
  });
  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version;
    log(`available ${info.version}`);
    broadcast({ state: 'downloading', percent: 0, version: info.version });
  });
  autoUpdater.on('update-not-available', () => broadcast({ state: 'idle' }));
  autoUpdater.on('download-progress', (p) => {
    broadcast({ state: 'downloading', percent: Math.round(p.percent), version: pendingVersion });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log(`downloaded ${info.version} — pronto para instalar`);
    broadcast({ state: 'ready', version: info.version });
  });

  const check = () => { void autoUpdater.checkForUpdatesAndNotify().catch((e) => log(`check failed ${e?.message ?? e}`)); };
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}
