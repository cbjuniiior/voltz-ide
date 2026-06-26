import * as nodePty from '@homebridge/node-pty-prebuilt-multiarch';
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { PtyCreateOptions, ShellKind } from '../../shared/types';

export interface ManagedPty {
  id: string;
  pty: IPty;
  cwd: string;
}

const ptys = new Map<string, ManagedPty>();

/** Eventos centrais do PTY: qualquer módulo do main pode grampear o stream. */
export const ptyEvents = new EventEmitter();

function shellExecutable(shell: ShellKind): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    if (shell === 'cmd') return { file: 'cmd.exe', args: [] };
    if (shell === 'bash') return { file: 'bash.exe', args: ['-l'] };
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  // macOS/Linux: as opções de shell do Windows (pwsh/cmd) não existem aqui.
  // Como `pwsh` é o padrão das configs, tentá-lo no Mac mata o terminal na hora
  // ("[processo encerrado]"). Usamos sempre o shell de login do usuário com `-l`
  // — isso carrega o PATH dele (.zprofile/.zshrc), igual ao Terminal.app, e é o
  // que faz o `claude` ser encontrado quando o app é aberto pelo Finder/Dock.
  const sysShell = process.env.SHELL || '/bin/zsh';
  if (shell === 'bash') return { file: 'bash', args: ['-l'] };
  if (shell === 'cmd') return { file: '/bin/sh', args: ['-l'] };
  return { file: sysShell, args: ['-l'] };
}

export interface PtyCallbacks {
  onData: (id: string, data: string) => void;
  onExit: (id: string, code: number) => void;
}

// PATH "real" do usuário lido do Registro do Windows (Machine + User). O app,
// quando aberto por um launcher/IDE, herda um PATH que pode estar desatualizado
// e não conter CLIs recém-instaladas (ex.: codex em ...\OpenAI\Codex\bin). Lemos
// uma vez e cacheamos.
let cachedWinPath: string | null = null;
function windowsRegistryPath(): string {
  if (cachedWinPath !== null) return cachedWinPath;
  const read = (root: string): string => {
    try {
      const out = execSync(`reg query "${root}" /v Path`, { encoding: 'utf8', timeout: 4000, windowsHide: true });
      const m = out.match(/^\s*Path\s+REG(?:_EXPAND)?_SZ\s+(.+?)\s*$/im);
      return m ? m[1] : '';
    } catch {
      return '';
    }
  };
  let result = '';
  try {
    const machine = read('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
    const user = read('HKCU\\Environment');
    result = [machine, user].filter(Boolean).join(';').replace(/%([^%]+)%/g, (_, n) => process.env[n] ?? '');
  } catch {
    result = '';
  }
  cachedWinPath = result;
  return result;
}

/** Mescla dois PATHs, removendo duplicatas (case-insensitive). */
function mergePath(current: string, extra: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [...current.split(';'), ...extra.split(';')]) {
    const p = part.trim();
    if (!p) continue;
    const key = p.toLowerCase().replace(/\\+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(';');
}

/**
 * Monta o env do shell: remove as variáveis `npm_*` (senão o `npm_config_prefix`
 * vaza e o nvm reclama) e, no Windows, mescla o PATH herdado com o PATH real do
 * usuário (Registro) para achar CLIs como o codex.
 */
function cleanEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith('npm_')) continue;
    env[k] = v;
  }
  if (process.platform === 'win32') {
    const reg = windowsRegistryPath();
    if (reg) {
      const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'Path';
      env[pathKey] = mergePath(env[pathKey] ?? '', reg);
    }
  }
  return { ...env, ...(extra || {}) };
}

export function createPty(opts: PtyCreateOptions, cb: PtyCallbacks): { ok: true } | { ok: false; error: string } {
  if (ptys.has(opts.id)) return { ok: false, error: `pty ${opts.id} ja existe` };
  const { file, args } = shellExecutable(opts.shell);
  try {
    const pty = nodePty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(20, opts.cols | 0),
      rows: Math.max(5, opts.rows | 0),
      cwd: opts.cwd,
      env: cleanEnv(opts.env),
    });

    pty.onData((data) => {
      cb.onData(opts.id, data);
      ptyEvents.emit('data', opts.id, data);
    });
    pty.onExit(({ exitCode }) => {
      ptys.delete(opts.id);
      cb.onExit(opts.id, exitCode);
      ptyEvents.emit('exit', opts.id, exitCode);
    });

    ptys.set(opts.id, { id: opts.id, pty, cwd: opts.cwd ?? '' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function writePty(id: string, data: string) {
  const m = ptys.get(id);
  if (!m) return;
  m.pty.write(data);
}

export function resizePty(id: string, cols: number, rows: number) {
  const m = ptys.get(id);
  if (!m) return;
  try {
    m.pty.resize(Math.max(20, cols | 0), Math.max(5, rows | 0));
  } catch {
    /* ignore */
  }
}

export function killPty(id: string) {
  const m = ptys.get(id);
  if (!m) return;
  try {
    m.pty.kill();
  } catch {
    /* ignore */
  }
  ptys.delete(id);
}

export function killAllPtys() {
  for (const id of [...ptys.keys()]) killPty(id);
}

/** PID do shell raiz de um PTY (base do monitor de recursos por terminal). */
export function getPtyPid(id: string): number | undefined {
  return ptys.get(id)?.pty.pid;
}

/** IDs de todos os PTYs vivos. */
export function listPtyIds(): string[] {
  return [...ptys.keys()];
}

export function getPtyCwd(id: string): string | undefined {
  return ptys.get(id)?.cwd;
}

export function listPtys(): { id: string; cwd: string }[] {
  return [...ptys.values()].map((m) => ({ id: m.id, cwd: m.cwd }));
}
