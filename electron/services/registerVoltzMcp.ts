import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { detectClaude } from './claudeDetect';
import { defaultClaudeDir, accountsBaseDir } from './claudeAccounts';
import type { McpServerInfo } from './browserMcpServer';

const pExec = promisify(execFile);

const SERVER_NAME = 'voltz-browser';

function diag(msg: string) {
  try {
    appendFileSync(path.join(app.getPath('userData'), 'voltz-diag.log'), `[${new Date().toISOString()}] [mcp] ${msg}\n`);
  } catch { /* ignore */ }
}

/** Todos os config dirs de Claude gerenciados pelo app: o padrão (~/.claude) + as contas. */
export async function listClaudeConfigDirs(): Promise<string[]> {
  const dirs = [defaultClaudeDir()];
  try {
    const base = accountsBaseDir();
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) dirs.push(path.join(base, e.name));
    }
  } catch { /* sem contas adicionais */ }
  return dirs;
}

/**
 * Roda o `claude mcp ...` apontando para o config dir certo.
 *
 * IMPORTANTE: a conta PRINCIPAL não usa CLAUDE_CONFIG_DIR (o app deixa a env
 * vazia — ver claudeAccounts/TerminalPane). Nesse caso o claude grava no
 * `~/.claude.json` nativo. Se setássemos CLAUDE_CONFIG_DIR=~/.claude, ele
 * gravaria em `~/.claude/.claude.json`, que os terminais da conta principal
 * NÃO leem → as ferramentas não apareceriam. Por isso, `configDir` undefined =
 * não seta a env (conta principal); definido = conta secundária.
 */
async function runClaude(claudePath: string, args: string[], configDir?: string): Promise<{ ok: boolean; err?: string }> {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudePath);
  const env = configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : { ...process.env };
  if (!configDir) delete env.CLAUDE_CONFIG_DIR; // garante o default nativo do claude
  try {
    await pExec(claudePath, args, { env, timeout: 20_000, windowsHide: true, shell: needsShell });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Registra (ou re-registra) o servidor MCP do navegador em cada config dir do
 * Claude, no escopo "user" — que é confiado automaticamente, sem prompt de
 * aprovação. Idempotente: remove antes de adicionar (a porta/token mudam a cada
 * inicialização do app).
 */
export async function registerVoltzMcpWithClaude(info: McpServerInfo): Promise<void> {
  const det = await detectClaude();
  if (!det.path) { diag('claude não encontrado — pulei o registro do MCP'); return; }
  const claudePath = det.path;
  const dirs = await listClaudeConfigDirs();
  const defaultDir = path.resolve(defaultClaudeDir());

  for (const dir of dirs) {
    // Conta principal (~/.claude) → sem CLAUDE_CONFIG_DIR (grava em ~/.claude.json).
    const cfg = path.resolve(dir) === defaultDir ? undefined : dir;
    // remove eventual entrada antiga (porta/token velhos) — ignora falha.
    await runClaude(claudePath, ['mcp', 'remove', SERVER_NAME, '--scope', 'user'], cfg);
    const add = await runClaude(claudePath, [
      'mcp', 'add',
      '--scope', 'user',
      '--transport', 'http',
      SERVER_NAME, info.url,
      '--header', `Authorization: Bearer ${info.token}`,
      // Identidade do terminal (escopo por aba): o claude expande
      // ${VOLTZ_TERMINAL_TOKEN} do ambiente do terminal em runtime. Literal aqui.
      '--header', 'X-Voltz-Terminal: ${VOLTZ_TERMINAL_TOKEN}',
    ], cfg);
    if (!add.ok) diag(`falha ao registrar em ${cfg ?? '(principal)'}: ${add.err}`);
  }
  diag(`registrado em ${dirs.length} config dir(s) — ${info.url}`);
}

/** Registra só para um config dir novo (ex.: conta recém-criada). */
export async function registerVoltzMcpForDir(info: McpServerInfo, dir: string): Promise<void> {
  const det = await detectClaude();
  if (!det.path) return;
  await runClaude(det.path, ['mcp', 'remove', SERVER_NAME, '--scope', 'user'], dir);
  await runClaude(det.path, [
    'mcp', 'add', '--scope', 'user', '--transport', 'http',
    SERVER_NAME, info.url,
    '--header', `Authorization: Bearer ${info.token}`,
    '--header', 'X-Voltz-Terminal: ${VOLTZ_TERMINAL_TOKEN}',
  ], dir);
}
