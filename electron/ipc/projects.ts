import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Project, DirEntry } from '../../shared/types';

const SKIP = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'release', '.cache']);

async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function scanRoot(root: string): Promise<Project[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: Project[] = [];
  for (const name of entries) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const full = path.join(root, name);
    if (!(await isDirectory(full))) continue;
    const isGit = await isDirectory(path.join(full, '.git'));
    out.push({
      id: full,
      name,
      path: full,
      rootFolder: root,
      isGit,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return out;
}

const DIR_SKIP = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'release',
  '.cache', '.vscode', '__pycache__', '.svelte-kit', 'coverage',
]);

export function registerProjectsIpc() {
  ipcMain.handle('projects:scan', async (_evt, roots: string[]) => {
    const all: Project[] = [];
    for (const r of roots) {
      const items = await scanRoot(r);
      all.push(...items);
    }
    return all;
  });

  ipcMain.handle('projects:readDir', async (_evt, dirPath: string): Promise<DirEntry[]> => {
    let entries: string[];
    try { entries = await fs.readdir(dirPath); } catch { return []; }
    const result: DirEntry[] = [];
    for (const name of entries) {
      if (DIR_SKIP.has(name)) continue;
      const full = path.join(dirPath, name);
      let isDir = false;
      try { isDir = (await fs.stat(full)).isDirectory(); } catch { continue; }
      result.push({ name, path: full, isDir });
    }
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    return result;
  });
}
