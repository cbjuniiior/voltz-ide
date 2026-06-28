import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DevServerPhase, DevServerState, PackageManager } from '../../shared/types';

interface ManagedDevServer {
  state: DevServerState;
  child: ChildProcess | null;
}

const servers = new Map<string, ManagedDevServer>();

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s\x1b'"<>]*)?/i;

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function commandFor(pm: PackageManager, kind: 'install' | 'dev'): string {
  if (kind === 'install') {
    if (pm === 'pnpm') return 'pnpm install';
    if (pm === 'yarn') return 'yarn install';
    if (pm === 'bun') return 'bun install';
    return 'npm install';
  }
  if (pm === 'pnpm') return 'pnpm run dev';
  if (pm === 'yarn') return 'yarn dev';
  if (pm === 'bun') return 'bun run dev';
  return 'npm run dev';
}

/** Comando para rodar um script arbitrário do package.json. */
function scriptCommand(pm: PackageManager, script: string): string {
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'pnpm') return `pnpm run ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `npm run ${script}`;
}

/** Lê os nomes dos scripts do package.json do projeto. */
export function getDevScripts(projectPath: string): string[] {
  try {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!existsSync(pkgPath)) return [];
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    return pkg.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts) : [];
  } catch {
    return [];
  }
}

function freshState(projectPath: string): DevServerState {
  return {
    projectPath,
    phase: 'idle',
    pm: detectPackageManager(projectPath),
    url: null,
    errorMessage: null,
    startedAt: null,
    recentLog: [],
  };
}

function getOrInit(projectPath: string): ManagedDevServer {
  let m = servers.get(projectPath);
  if (!m) {
    m = { state: freshState(projectPath), child: null };
    servers.set(projectPath, m);
  }
  return m;
}

type Listener = (s: DevServerState) => void;
const listeners = new Set<Listener>();

export function onDevServerUpdate(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(state: DevServerState) {
  for (const l of listeners) {
    try { l({ ...state, recentLog: [...state.recentLog] }); } catch { /* ignore */ }
  }
}

function setPhase(m: ManagedDevServer, phase: DevServerPhase, patch?: Partial<DevServerState>) {
  m.state = { ...m.state, phase, ...(patch || {}) };
  emit(m.state);
}

function pushLog(m: ManagedDevServer, raw: string) {
  const clean = raw.replace(ANSI_RE, '').replace(/\r/g, '');
  for (const line of clean.split('\n')) {
    if (!line.trim()) continue;
    m.state.recentLog.push(line);
  }
  if (m.state.recentLog.length > 60) {
    m.state.recentLog.splice(0, m.state.recentLog.length - 60);
  }

  if (!m.state.url) {
    const match = clean.match(URL_RE);
    if (match) {
      m.state.url = match[0].replace(/[.,;:)\]'"]*$/, '');
    }
  }
  emit(m.state);
}

// PATH "real" do usuário no macOS/Linux. Aberto pelo Finder/Dock, o app herda
// só o PATH mínimo do launchd — sem homebrew/nvm/bun/npm-global —, então um
// `npm install` via `/bin/sh -c` falha com "npm: command not found" (exit 127).
// Perguntamos ao shell de login+interativo (`-lic` carrega .zprofile E .zshrc,
// onde esses PATHs costumam ser definidos) e cacheamos. Mesma ideia do
// windowsRegistryPath() do ptyManager.
let cachedUnixPath: string | null = null;
const PATH_MARKER = '__VOLTZ_PATH__';
function loginShellPath(): string {
  if (cachedUnixPath !== null) return cachedUnixPath;
  let result = '';
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    // Marcador isola o PATH de qualquer banner que o .zshrc imprima.
    const out = execFileSync(shell, ['-lic', `printf '${PATH_MARKER}%s\\n' "$PATH"`], {
      encoding: 'utf8',
      timeout: 6000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split(/\r?\n/).find((l) => l.startsWith(PATH_MARKER));
    result = line ? line.slice(PATH_MARKER.length).trim() : '';
  } catch {
    result = '';
  }
  cachedUnixPath = result;
  return result;
}

/** Mescla dois PATHs (estilo Unix, `:`), sem duplicatas, priorizando `extra`. */
function mergeUnixPath(current: string, extra: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [...extra.split(':'), ...current.split(':')]) {
    const p = part.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.join(':');
}

/** Env do spawn: no macOS/Linux injeta o PATH do shell de login do usuário. */
function spawnEnv(): NodeJS.ProcessEnv {
  if (process.platform === 'win32') return process.env;
  const userPath = loginShellPath();
  if (!userPath) return process.env;
  return { ...process.env, PATH: mergeUnixPath(process.env.PATH || '', userPath) };
}

function spawnShell(cmd: string, cwd: string): ChildProcess {
  const isWin = process.platform === 'win32';
  if (isWin) {
    return spawn('cmd.exe', ['/d', '/s', '/c', cmd], {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return spawn(cmd, {
    cwd,
    env: spawnEnv(),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function killChildTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch { /* ignore */ }
  } else {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 2000);
  }
}

export function getDevServerState(projectPath: string): DevServerState | null {
  const m = servers.get(projectPath);
  return m ? { ...m.state, recentLog: [...m.state.recentLog] } : null;
}

export function listDevServers(): DevServerState[] {
  return [...servers.values()].map((m) => ({ ...m.state, recentLog: [...m.state.recentLog] }));
}

export async function startDevServer(
  projectPath: string,
  opts: { skipInstall?: boolean; script?: string } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scriptName = opts.script || 'dev';
  const m = getOrInit(projectPath);
  if (m.child && (m.state.phase === 'installing' || m.state.phase === 'starting' || m.state.phase === 'running')) {
    return { ok: false, error: 'Dev server already running for this project' };
  }

  if (!existsSync(path.join(projectPath, 'package.json'))) {
    setPhase(m, 'error', { errorMessage: 'package.json não encontrado nesta pasta' });
    return { ok: false, error: 'package.json not found' };
  }

  m.state = freshState(projectPath);
  m.state.startedAt = Date.now();

  // Sempre rodar o install antes do dev (a pedido): garante deps atualizadas.
  // `skipInstall` ainda permite pular explicitamente, se algum chamador quiser.
  const needInstall = !opts.skipInstall;

  const runDev = () => {
    setPhase(m, 'starting', { errorMessage: null });
    const cmd = scriptCommand(m.state.pm, scriptName);
    pushLog(m, `\n$ ${cmd}\n`);
    const child = spawnShell(cmd, projectPath);
    m.child = child;

    child.stdout?.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      pushLog(m, text);
      if (m.state.phase === 'starting' && m.state.url) {
        setPhase(m, 'running');
      }
    });
    child.stderr?.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      pushLog(m, text);
      if (m.state.phase === 'starting' && m.state.url) {
        setPhase(m, 'running');
      }
    });
    child.on('exit', (code) => {
      m.child = null;
      if (m.state.phase === 'stopped') return;
      if (code === 0 || code === null) {
        setPhase(m, 'stopped');
      } else {
        setPhase(m, 'error', { errorMessage: `dev exited with code ${code}` });
      }
    });
    child.on('error', (err) => {
      m.child = null;
      setPhase(m, 'error', { errorMessage: err.message });
    });
  };

  if (needInstall) {
    setPhase(m, 'installing');
    const cmd = commandFor(m.state.pm, 'install');
    pushLog(m, `\n$ ${cmd}\n`);
    const child = spawnShell(cmd, projectPath);
    m.child = child;

    child.stdout?.on('data', (buf: Buffer) => pushLog(m, buf.toString('utf8')));
    child.stderr?.on('data', (buf: Buffer) => pushLog(m, buf.toString('utf8')));
    child.on('exit', (code) => {
      m.child = null;
      if (m.state.phase === 'stopped') return;
      if (code === 0) {
        runDev();
      } else {
        setPhase(m, 'error', { errorMessage: `install exited with code ${code}` });
      }
    });
    child.on('error', (err) => {
      m.child = null;
      setPhase(m, 'error', { errorMessage: err.message });
    });
  } else {
    runDev();
  }

  return { ok: true };
}

export function stopDevServer(projectPath: string): void {
  const m = servers.get(projectPath);
  if (!m) return;
  if (m.child) {
    killChildTree(m.child);
    m.child = null;
  }
  setPhase(m, 'stopped', { url: null });
}

export function killAllDevServers(): void {
  for (const m of servers.values()) {
    if (m.child) {
      killChildTree(m.child);
      m.child = null;
    }
  }
}
