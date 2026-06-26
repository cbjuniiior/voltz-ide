import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ClaudeDetectResult } from '../../shared/types';

const pExec = promisify(execFile);

async function whereClaudeViaLoginShell(): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    // -lic = login + interativo: carrega .zprofile E .zshrc, onde o PATH do
    // usuário (npm-global, nvm, bun, homebrew…) costuma ser definido.
    const { stdout } = await pExec(shell, ['-lic', 'command -v claude'], { timeout: 6000 });
    const out = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
    return out && fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

async function whereClaude(): Promise<string | null> {
  if (process.platform !== 'win32') {
    try {
      const { stdout } = await pExec('which', ['claude']);
      const out = stdout.trim().split(/\r?\n/)[0];
      if (out && fs.existsSync(out)) return out;
    } catch {
      /* tenta o shell de login abaixo */
    }
    // Aberto pelo Finder/Dock, o app herda só o PATH mínimo do launchd — o
    // `which` acima não enxerga ~/.npm-global/bin, ~/.local/bin etc. Pergunta ao
    // shell de login+interativo do usuário (carrega .zprofile e .zshrc).
    return whereClaudeViaLoginShell();
  }
  try {
    const { stdout } = await pExec('where.exe', ['claude']);
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line)) return line;
    }
    return null;
  } catch {
    return null;
  }
}

function knownPaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      path.join(home, '.local', 'bin', 'claude.exe'),   // instalador padrao Claude Code no Windows
      path.join(home, '.local', 'bin', 'claude'),
      path.join(localAppData, 'Programs', 'claude', 'claude.exe'),
      path.join(appData, 'npm', 'claude.cmd'),
      path.join(appData, 'npm', 'claude'),
      path.join(home, '.bun', 'bin', 'claude.exe'),
      path.join(home, '.bun', 'bin', 'claude'),
    ];
  }
  return [
    path.join(home, '.npm-global', 'bin', 'claude'),  // npm prefix custom (comum)
    path.join(home, '.local', 'bin', 'claude'),        // instalador nativo do Claude Code
    path.join(home, '.bun', 'bin', 'claude'),
    path.join(home, '.yarn', 'bin', 'claude'),
    path.join(home, 'node_modules', '.bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
}

export async function detectClaude(): Promise<ClaudeDetectResult> {
  const fromWhere = await whereClaude();
  if (fromWhere) return { path: fromWhere, source: 'where' };

  for (const candidate of knownPaths()) {
    if (fs.existsSync(candidate)) {
      const lower = candidate.toLowerCase();
      const source = lower.includes('localappdata') || lower.includes('programs')
        ? 'localappdata'
        : lower.includes('npm')
        ? 'npm'
        : 'bun';
      return { path: candidate, source };
    }
  }
  return { path: null, source: 'none' };
}
