import { ipcMain, BrowserWindow } from 'electron';
import { appStore as store } from '../services/appStore';

export function registerStoreIpc() {
  ipcMain.handle('store:get', (_evt, key: string) => {
    return store.get(key);
  });
  ipcMain.handle('store:set', (evt, key: string, value: unknown) => {
    store.set(key, value);
    // Avisa as OUTRAS janelas (ex.: janela flutuante de Tarefas) para que
    // sincronizem seu estado sem precisar reler o disco.
    for (const win of BrowserWindow.getAllWindows()) {
      const wc = win.webContents;
      if (wc.id !== evt.sender.id && !wc.isDestroyed()) {
        wc.send('store:changed', key, value);
      }
    }
  });
}
