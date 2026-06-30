import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appStore } from '../services/appStore';

// Persiste as edições do "Modo Editor" por projeto e por URL (para reaplicar ao
// recarregar) e grava o CSS gerado num arquivo dentro do projeto.
const KEY = 'liveEdits';
type Store = Record<string, Record<string, unknown>>; // projectPath -> url -> EditMap

export const LIVE_EDIT_FILE = 'voltz-live-edits.css';

export function registerLiveEditIpc() {
  ipcMain.handle('liveedit:save', async (_e, projectPath: string, url: string, css: string, editMap: unknown) => {
    try {
      let file = '';
      if (projectPath) {
        file = path.join(projectPath, LIVE_EDIT_FILE);
        await fs.writeFile(file, css, 'utf8');
      }
      const all = (appStore.get(KEY) as Store) ?? {};
      all[projectPath] = all[projectPath] ?? {};
      all[projectPath][url] = editMap;
      appStore.set(KEY, all);
      return { ok: true as const, file };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

  ipcMain.handle('liveedit:get', (_e, projectPath: string, url: string) => {
    const all = (appStore.get(KEY) as Store) ?? {};
    return all[projectPath]?.[url] ?? null;
  });
}
