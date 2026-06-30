import { ipcMain } from 'electron';
import { detectClaude } from '../services/claudeDetect';
import { listClaudeSessions, listAllClaudeSessions, getClaudeUsage, getCurrentModel } from '../services/claudeSessions';
import { defaultClaudeDir, createAccountDir, removeAccountDir, getAccountIdentity } from '../services/claudeAccounts';
import { generateCommitMessage } from '../services/claudeCommit';
import { getMcpServerInfo } from '../services/browserMcpServer';
import { registerVoltzMcpForDir } from '../services/registerVoltzMcp';

export function registerClaudeIpc() {
  ipcMain.handle('claude:commitMessage', async (_evt, opts: { diff: string; cwd: string; configDir?: string }) =>
    generateCommitMessage(opts.diff, opts.cwd, opts.configDir));
  ipcMain.handle('claude:detect', async () => detectClaude());
  ipcMain.handle('claude:sessions', async (_evt, projectPath: string, configDir?: string) => listClaudeSessions(projectPath, configDir));
  ipcMain.handle('claude:allSessions', async (_evt, limit?: number, configDirs?: string[]) => listAllClaudeSessions(limit, configDirs));
  ipcMain.handle('claude:usage', async (_evt, configDir?: string) => getClaudeUsage(configDir));
  ipcMain.handle('claude:currentModel', async (_evt, projectPath: string, configDir?: string) => getCurrentModel(projectPath, configDir));

  // Gestão de contas (multi-conta Claude via CLAUDE_CONFIG_DIR).
  ipcMain.handle('accounts:defaultDir', async () => defaultClaudeDir());
  ipcMain.handle('accounts:createDir', async (_evt, id: string) => {
    const dir = await createAccountDir(id);
    // Registra o MCP do navegador na conta nova (escopo user, sem prompt).
    const info = getMcpServerInfo();
    if (info) void registerVoltzMcpForDir(info, dir).catch(() => { /* ignore */ });
    return dir;
  });
  ipcMain.handle('accounts:removeDir', async (_evt, dir: string) => removeAccountDir(dir));
  ipcMain.handle('accounts:identity', async (_evt, dir: string) => getAccountIdentity(dir));
}
