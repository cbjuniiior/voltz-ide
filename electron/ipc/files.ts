import { ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import chokidar from 'chokidar';

/**
 * Recusa vigiar diretórios perigosamente amplos — a home do usuário ou a raiz
 * de um drive. Um watch recursivo aí varre o perfil inteiro (AppData, caches…),
 * estourando RAM/CPU. Isso acontecia ao abrir um terminal com cwd = home.
 */
function isUnsafeWatchRoot(root: string): boolean {
  const resolved = path.resolve(root);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) return true;            // raiz de drive (C:\)
  const home = path.resolve(os.homedir());
  if (resolved === home) return true;                   // a própria home
  if (home.startsWith(resolved + path.sep)) return true; // root é ancestral da home
  return false;
}

// ----------------------------------------------------------------------------
// Safety: every file path the renderer hands us must live INSIDE one of the
// user's project roots OR a tracked open project path. The renderer always
// passes (projectRoot, relativeOrAbsolutePath); the main process resolves
// against the root and refuses anything that escapes via `..`.
// ----------------------------------------------------------------------------

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5MB — reject opening huge files as text

function resolveInsideRoot(root: string, target: string): string | null {
  // Accept either absolute target (must be inside root) or relative target.
  const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
  const normRoot = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(normRoot)) return null;
  return abs;
}

// Heuristic: scan the first 8KB for NUL bytes — same trick `git` uses to
// detect "binary" content. Cheap and good enough to refuse opening images,
// PDFs, executables as text in Monaco.
function looksBinary(buf: Buffer, limit = 8192): boolean {
  const end = Math.min(buf.length, limit);
  for (let i = 0; i < end; i++) if (buf[i] === 0) return true;
  return false;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export interface SearchMatch {
  /** Caminho relativo à raiz (forward slashes). */
  file: string;
  line: number;
  col: number;
  preview: string;
}

export interface FileStat {
  exists: boolean;
  isDir: boolean;
  size: number;
  mtimeMs: number;
}

// ----------------------------------------------------------------------------
// Recursive listing — used by quick-open. Honours .gitignore-ish defaults:
// node_modules, .git, dist, build, .next, .cache, coverage, .turbo, .vercel
// and very large dirs are skipped. Result is path strings relative to root,
// using forward slashes so they're easy to fuzzy-match consistently.
// ----------------------------------------------------------------------------

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache',
  '.turbo', '.vercel', '.svelte-kit', 'coverage', '.parcel-cache',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode-server',
  'release', 'dist-electron', 'out',
]);
const MAX_LIST_FILES = 20000;

async function walkDir(root: string, dir: string, acc: string[]): Promise<void> {
  if (acc.length >= MAX_LIST_FILES) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return; }
  for (const entry of entries) {
    if (acc.length >= MAX_LIST_FILES) return;
    if (entry.name.startsWith('.') && IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkDir(root, full, acc);
    } else if (entry.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      acc.push(rel);
    }
  }
}

// ----------------------------------------------------------------------------
// File watcher — one chokidar instance per (window, projectRoot) pair.
// Renderer subscribes by calling `files:watch:start` and receives events on
// `files:watch:event`. The renderer is responsible for unsubscribing.
// ----------------------------------------------------------------------------

interface WatcherEntry {
  watcher: ReturnType<typeof chokidar.watch>;
  refCount: number;
}
const watchers = new Map<string, WatcherEntry>();

function watcherKey(windowId: number, root: string) {
  return `${windowId}::${root}`;
}

function startWatcher(window: BrowserWindow, root: string) {
  if (isUnsafeWatchRoot(root)) return; // não vigia home/raiz de drive
  const key = watcherKey(window.id, root);
  const existing = watchers.get(key);
  if (existing) {
    existing.refCount += 1;
    return;
  }
  const watcher = chokidar.watch(root, {
    ignored: (p: string) => {
      const base = path.basename(p);
      return IGNORED_DIRS.has(base);
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 },
    depth: 12,
  });
  const send = (event: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir', filePath: string) => {
    if (window.isDestroyed()) return;
    window.webContents.send('files:watch:event', {
      root,
      event,
      path: filePath,
    });
  };
  watcher.on('add', (p) => send('add', p));
  watcher.on('addDir', (p) => send('addDir', p));
  watcher.on('change', (p) => send('change', p));
  watcher.on('unlink', (p) => send('unlink', p));
  watcher.on('unlinkDir', (p) => send('unlinkDir', p));
  watchers.set(key, { watcher, refCount: 1 });

  // Tear down when the window closes.
  window.on('closed', () => {
    const w = watchers.get(key);
    if (w) {
      void w.watcher.close();
      watchers.delete(key);
    }
  });
}

function stopWatcher(windowId: number, root: string) {
  const key = watcherKey(windowId, root);
  const entry = watchers.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    void entry.watcher.close();
    watchers.delete(key);
  }
}

// ----------------------------------------------------------------------------
// Git diff — shells out to `git diff --no-color --unified=0 HEAD -- <file>`
// (working tree vs HEAD) so we get all uncommitted changes for the file.
// Returns parsed hunks: { startLine, lineCount, kind }.
// ----------------------------------------------------------------------------

export interface GitHunk {
  /** Line numbers are 1-based, in the NEW (working tree) file. */
  startLine: number;
  /** Number of added lines (0 means pure deletion at this position). */
  added: number;
  /** Number of deleted lines (0 means pure addition). */
  deleted: number;
}

function parseDiff(diff: string): GitHunk[] {
  const hunks: GitHunk[] = [];
  // Hunk header: @@ -oldStart[,oldLen] +newStart[,newLen] @@
  const re = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
  let m;
  while ((m = re.exec(diff)) !== null) {
    const newStart = Number(m[3]);
    const newLen = m[4] === undefined ? 1 : Number(m[4]);
    const oldLen = m[2] === undefined ? 1 : Number(m[2]);
    hunks.push({
      startLine: newStart,
      added: newLen,
      deleted: oldLen,
    });
  }
  return hunks;
}

const GIT_DIFF_TIMEOUT_MS = 10_000;

function runGitDiff(root: string, relativePath: string): Promise<string> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('git', ['diff', '--no-color', '--unified=0', 'HEAD', '--', relativePath], {
        cwd: root,
        windowsHide: true,
      });
    } catch {
      resolve('');
      return;
    }
    let out = '';
    let err = '';
    let settled = false;
    const finish = (v: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    // Evita que um diff travado (repo enorme, lock) prenda o handler.
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* já morreu */ }
      finish('');
    }, GIT_DIFF_TIMEOUT_MS);
    child.stdout?.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr?.on('data', (b) => { err += b.toString('utf8'); });
    child.on('close', (code) => finish(code !== 0 && err ? '' : out));
    child.on('error', () => finish(''));
  });
}

export function registerFilesIpc() {
  ipcMain.handle('files:stat', async (_evt, root: string, target: string): Promise<FileStat> => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { exists: false, isDir: false, size: 0, mtimeMs: 0 };
    try {
      const st = await fs.stat(abs);
      return {
        exists: true,
        isDir: st.isDirectory(),
        size: st.size,
        mtimeMs: st.mtimeMs,
      };
    } catch {
      return { exists: false, isDir: false, size: 0, mtimeMs: 0 };
    }
  });

  ipcMain.handle('files:read', async (_evt, root: string, target: string) => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    try {
      const st = await fs.stat(abs);
      if (st.isDirectory()) return { ok: false as const, error: 'É um diretório.' };
      if (st.size > MAX_TEXT_BYTES) {
        return { ok: false as const, error: `Arquivo grande demais (${(st.size / 1024 / 1024).toFixed(1)} MB). Limite ${MAX_TEXT_BYTES / 1024 / 1024} MB.` };
      }
      const buf = await fs.readFile(abs);
      if (looksBinary(buf)) {
        return { ok: false as const, error: 'Arquivo binário — Monaco abre só texto.', binary: true as const };
      }
      return {
        ok: true as const,
        content: buf.toString('utf8'),
        mtimeMs: st.mtimeMs,
        size: st.size,
      };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  // Lê um arquivo (imagem/SVG) como data URI base64 — para o visualizador exibir.
  ipcMain.handle('files:readDataUrl', async (_evt, root: string, target: string) => {
    const IMAGE_MIME: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
      bmp: 'image/bmp', apng: 'image/apng',
    };
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    try {
      const st = await fs.stat(abs);
      if (st.isDirectory()) return { ok: false as const, error: 'É um diretório.' };
      if (st.size > 25 * 1024 * 1024) return { ok: false as const, error: `Imagem grande demais (${(st.size / 1024 / 1024).toFixed(1)} MB). Limite 25 MB.` };
      const ext = abs.split('.').pop()?.toLowerCase() ?? '';
      const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
      const buf = await fs.readFile(abs);
      return { ok: true as const, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime, size: st.size };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('files:write', async (
    _evt,
    root: string,
    target: string,
    content: string,
    opts?: { expectedMtimeMs?: number }
  ) => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    try {
      // Optimistic concurrency: if caller passed expectedMtimeMs and the file
      // changed on disk since, refuse. Renderer can decide to overwrite.
      if (opts?.expectedMtimeMs !== undefined) {
        try {
          const cur = await fs.stat(abs);
          if (Math.floor(cur.mtimeMs) > Math.floor(opts.expectedMtimeMs) + 1) {
            return {
              ok: false as const,
              error: 'Arquivo foi modificado por fora desde a última leitura.',
              code: 'STALE' as const,
              currentMtimeMs: cur.mtimeMs,
            };
          }
        } catch { /* file doesn't exist yet — fine, treat as create */ }
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
      const st = await fs.stat(abs);
      return { ok: true as const, mtimeMs: st.mtimeMs, size: st.size };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('files:create', async (
    _evt,
    root: string,
    target: string,
    kind: 'file' | 'directory'
  ) => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    try {
      // Refuse to overwrite an existing entry — caller should pick another name.
      try {
        await fs.stat(abs);
        return { ok: false as const, error: 'Já existe um arquivo/pasta com esse nome.', code: 'EEXIST' as const };
      } catch { /* not found — proceed */ }
      if (kind === 'directory') {
        await fs.mkdir(abs, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        // wx flag: fail if exists (extra safety against TOCTOU)
        const fh = await fs.open(abs, 'wx');
        await fh.close();
      }
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('files:delete', async (_evt, root: string, target: string) => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    // Extra guard: refuse to delete the project root itself.
    if (abs === path.resolve(root)) {
      return { ok: false as const, error: 'Não dá pra apagar a raiz do projeto.' };
    }
    try {
      await fs.rm(abs, { recursive: true, force: true });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('files:rename', async (_evt, root: string, fromTarget: string, toTarget: string) => {
    const absFrom = resolveInsideRoot(root, fromTarget);
    const absTo = resolveInsideRoot(root, toTarget);
    if (!absFrom || !absTo) return { ok: false as const, error: 'Caminho fora do projeto.' };
    try {
      try {
        await fs.stat(absTo);
        return { ok: false as const, error: 'Destino já existe.', code: 'EEXIST' as const };
      } catch { /* not found — fine */ }
      await fs.mkdir(path.dirname(absTo), { recursive: true });
      await fs.rename(absFrom, absTo);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('files:listAll', async (_evt, root: string) => {
    if (!await isDirectory(root)) return [];
    const acc: string[] = [];
    await walkDir(root, root, acc);
    return acc;
  });

  ipcMain.handle('files:watch:start', (evt, root: string) => {
    const window = BrowserWindow.fromWebContents(evt.sender);
    if (!window || !path.isAbsolute(root)) return { ok: false as const, error: 'Janela inválida.' };
    startWatcher(window, root);
    return { ok: true as const };
  });

  ipcMain.handle('files:watch:stop', (evt, root: string) => {
    const window = BrowserWindow.fromWebContents(evt.sender);
    if (!window) return { ok: false as const };
    stopWatcher(window.id, root);
    return { ok: true as const };
  });

  ipcMain.handle('files:search', async (
    _evt,
    root: string,
    query: string,
    opts?: { caseSensitive?: boolean; maxResults?: number; regex?: boolean; wholeWord?: boolean },
  ): Promise<{ matches: SearchMatch[]; truncated: boolean; error?: string }> => {
    const raw = (query ?? '').trim();
    if (!raw || !(await isDirectory(root))) return { matches: [], truncated: false };
    const max = opts?.maxResults ?? 300;
    const cs = !!opts?.caseSensitive;

    // Modo regex (ou whole-word, que internamente vira a regex \bpalavra\b).
    let re: RegExp | null = null;
    if (opts?.regex || opts?.wholeWord) {
      try {
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const body = opts?.regex ? raw : escaped;
        const pattern = opts?.wholeWord ? `\\b(?:${body})\\b` : body;
        re = new RegExp(pattern, cs ? '' : 'i');
      } catch {
        return { matches: [], truncated: false, error: 'Expressão regular inválida' };
      }
    }
    const needle = cs ? raw : raw.toLowerCase();

    const rels: string[] = [];
    await walkDir(root, root, rels);

    const matches: SearchMatch[] = [];
    let truncated = false;
    for (const rel of rels) {
      if (matches.length >= max) { truncated = true; break; }
      const abs = path.join(root, rel);
      let buf: Buffer;
      try {
        const st = await fs.stat(abs);
        if (st.size > MAX_TEXT_BYTES) continue;
        buf = await fs.readFile(abs);
      } catch { continue; }
      if (looksBinary(buf)) continue;
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let col = -1;
        if (re) {
          const m = re.exec(line);
          if (m) col = m.index;
        } else {
          const hay = cs ? line : line.toLowerCase();
          col = hay.indexOf(needle);
        }
        if (col >= 0) {
          matches.push({ file: rel, line: i + 1, col: col + 1, preview: line.slice(0, 240).replace(/\r$/, '') });
          if (matches.length >= max) { truncated = true; break; }
        }
      }
    }
    return { matches, truncated };
  });

  ipcMain.handle('files:gitDiff', async (_evt, root: string, target: string) => {
    const abs = resolveInsideRoot(root, target);
    if (!abs) return { ok: false as const, error: 'Caminho fora do projeto.' };
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const diff = await runGitDiff(root, rel);
    return { ok: true as const, hunks: parseDiff(diff) };
  });
}
