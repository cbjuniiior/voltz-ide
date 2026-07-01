import { ipcMain } from 'electron';
import {
  installPersonas, uninstallPersonas, listInstalledPersonas, readPersona, writePersona, PERSONAS_VERSION,
} from '../services/agentsInstall';
import { listClaudeConfigDirs } from '../services/registerVoltzMcp';
import { defaultClaudeDir } from '../services/claudeAccounts';
import { detectStack } from '../services/stackDetect';

/** IPC do Esquadrão: instala/gere as personas (subagentes) em todos os config dirs. */
export function registerAgentsIpc() {
  ipcMain.handle('agents:install', async () => {
    const dirs = await listClaudeConfigDirs();
    return installPersonas(dirs);
  });
  ipcMain.handle('agents:uninstall', async () => {
    const dirs = await listClaudeConfigDirs();
    await uninstallPersonas(dirs);
    return { ok: true };
  });
  ipcMain.handle('agents:listInstalled', async (_e, configDir?: string) => {
    return listInstalledPersonas(configDir || defaultClaudeDir());
  });
  ipcMain.handle('agents:read', async (_e, id: string, configDir?: string) => {
    return readPersona(configDir || defaultClaudeDir(), id);
  });
  ipcMain.handle('agents:write', async (_e, id: string, body: string) => {
    const dirs = await listClaudeConfigDirs();
    return writePersona(dirs, id, body);
  });
  ipcMain.handle('agents:version', () => PERSONAS_VERSION);
  ipcMain.handle('agents:detectStack', async (_e, projectPath: string) => detectStack(projectPath));
}
