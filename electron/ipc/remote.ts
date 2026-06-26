import { ipcMain, BrowserWindow } from 'electron';
import type { TelegramBridge } from '../services/remote/telegramBridge';
import { getRemoteConfig, setRemoteConfig } from '../services/remote/config';
import { getRemoteHistory, clearRemoteHistory } from '../services/remote/history';
import { TelegramApi } from '../services/remote/telegramApi';

export function registerRemoteIpc(getBridge: () => TelegramBridge, getWin: () => BrowserWindow | null) {
  ipcMain.handle('remote:status', () => getBridge().status());

  ipcMain.handle('remote:setToken', async (_e, token: string | null) => {
    setRemoteConfig({ token });
    if (!token) { getBridge().stop(); return { ok: true }; }
    try {
      const me = await new TelegramApi(token).getMe();
      return { ok: true, botUsername: me.username };
    } catch (err) { return { ok: false, error: (err as Error).message }; }
  });

  ipcMain.handle('remote:setEnabled', async (_e, on: boolean) => {
    setRemoteConfig({ enabled: on });
    // Sempre para antes, para um restart limpo (pega token/config novos, sem loop duplicado).
    getBridge().stop();
    if (on) await getBridge().start();
  });

  ipcMain.handle('remote:setProjectEnabled', (_e, projectPath: string, on: boolean) => {
    const cur = getRemoteConfig().projects;
    const next = on ? [...new Set([...cur, projectPath])] : cur.filter((p) => p !== projectPath);
    setRemoteConfig({ projects: next });
  });

  ipcMain.handle('remote:listProjectsEnabled', () => getRemoteConfig().projects);
  ipcMain.handle('remote:generatePairingCode', () => getBridge().generatePairing());
  ipcMain.handle('remote:unpair', () => { setRemoteConfig({ ownerChatId: null }); });

  ipcMain.handle('remote:getHistory', () => getRemoteHistory());
  ipcMain.handle('remote:clearHistory', (_e, project?: string) => clearRemoteHistory(project));

  // push de status para a UI de Config
  void getWin;
}
