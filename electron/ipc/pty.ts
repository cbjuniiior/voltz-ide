import { ipcMain, type BrowserWindow } from 'electron';
import { createPty, writePty, resizePty, killPty, killAllPtys as killAll } from '../services/ptyManager';
import type { PtyCreateOptions } from '../../shared/types';

export function registerPtyIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('pty:create', async (_evt, opts: PtyCreateOptions) => {
    return createPty(opts, {
      onData: (id, data) => {
        const w = getWindow();
        w?.webContents.send('pty:data', id, data);
      },
      onExit: (id, code) => {
        const w = getWindow();
        w?.webContents.send('pty:exit', id, code);
      },
    });
  });

  ipcMain.on('pty:write', (_evt, id: string, data: string) => writePty(id, data));
  ipcMain.on('pty:resize', (_evt, id: string, cols: number, rows: number) => resizePty(id, cols, rows));
  ipcMain.on('pty:kill', (_evt, id: string) => killPty(id));
}

export function killAllPtys() {
  killAll();
}
