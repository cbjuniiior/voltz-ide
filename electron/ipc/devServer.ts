import { ipcMain, shell, type BrowserWindow } from 'electron';
import {
  startDevServer,
  stopDevServer,
  getDevServerState,
  listDevServers,
  onDevServerUpdate,
  getDevScripts,
} from '../services/devServerManager';

export function registerDevServerIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('devServer:start', async (_evt, projectPath: string, opts?: { skipInstall?: boolean; script?: string }) => {
    return startDevServer(projectPath, opts || {});
  });

  ipcMain.handle('devServer:scripts', async (_evt, projectPath: string) => {
    return getDevScripts(projectPath);
  });

  ipcMain.handle('devServer:stop', async (_evt, projectPath: string) => {
    stopDevServer(projectPath);
  });

  ipcMain.handle('devServer:status', async (_evt, projectPath: string) => {
    return getDevServerState(projectPath);
  });

  ipcMain.handle('devServer:listAll', async () => {
    return listDevServers();
  });

  ipcMain.handle('devServer:openUrl', async (_evt, url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    await shell.openExternal(url);
  });

  onDevServerUpdate((state) => {
    const w = getWindow();
    w?.webContents.send('devServer:update', state);
  });
}
