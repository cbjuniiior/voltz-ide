import { ipcMain, app, clipboard } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export function registerClipboardIpc() {
  ipcMain.handle('clipboard:getImage', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return { png: img.toPNG().toString('base64') };
  });

  ipcMain.handle('clipboard:saveImage', async (_evt, base64: string, ext: string) => {
    const tmpDir = path.join(app.getPath('temp'), 'voltz-ide');
    await fs.mkdir(tmpDir, { recursive: true });
    const filename = `paste-${Date.now()}.${ext}`;
    const filepath = path.join(tmpDir, filename);
    await fs.writeFile(filepath, Buffer.from(base64, 'base64'));
    return filepath;
  });

  // Native Electron clipboard write — bypasses navigator.clipboard restrictions
  // (focus requirements, silent failures in renderer contexts).
  ipcMain.handle('clipboard:writeText', (_evt, text: string) => {
    clipboard.writeText(text ?? '');
    return true;
  });

  ipcMain.handle('clipboard:readText', () => {
    return clipboard.readText();
  });
}
