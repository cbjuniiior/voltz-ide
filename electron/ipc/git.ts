import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/** Operações locais rápidas (status, diff, branches…). */
const GIT_TIMEOUT_MS = 20_000;
/** Operações de rede (push/pull) toleram links lentos. */
const GIT_NET_TIMEOUT_MS = 120_000;

function runGit(
  args: string[],
  cwd: string,
  timeoutMs: number = GIT_TIMEOUT_MS,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('git', args, { cwd, windowsHide: true });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'git indisponível' });
      return;
    }
    let out = '';
    let err = '';
    let settled = false;
    const finish = (r: { code: number; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    // Sem isto um git pendurado (rede caída, lock travado) deixa o handler
    // do main process aguardando para sempre. Mata o processo e devolve erro.
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* já morreu */ }
      finish({ code: -1, stdout: out, stderr: err.trim() || `git excedeu ${Math.round(timeoutMs / 1000)}s e foi cancelado.` });
    }, timeoutMs);
    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr.on('data', (b) => { err += b.toString('utf8'); });
    child.on('close', (code) => finish({ code: code ?? -1, stdout: out, stderr: err }));
    child.on('error', () => finish({ code: -1, stdout: '', stderr: 'git não encontrado' }));
  });
}

export interface GitInfo {
  isRepo: boolean;
  branch: string | null;
  changes: number;
  /** Commits locais à frente do remoto (para push). */
  ahead: number;
  /** Commits do remoto à frente do local (para pull) — reflete o GitHub após um fetch. */
  behind: number;
  /** Há um upstream configurado (origin/…) — senão behind/ahead não fazem sentido. */
  hasUpstream: boolean;
}

export interface GitFile {
  path: string;
  /** Status no índice (staged). */
  index: string;
  /** Status na árvore de trabalho. */
  work: string;
}

async function getInfo(root: string): Promise<GitInfo> {
  const res = await runGit(['status', '--porcelain=v1', '--branch'], root);
  if (res.code !== 0) return { isRepo: false, branch: null, changes: 0, ahead: 0, behind: 0, hasUpstream: false };
  let branch: string | null = null;
  let ahead = 0, behind = 0, changes = 0, hasUpstream = false;
  for (const line of res.stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const name = line.slice(3).split(' ')[0]; // "main...origin/main" ou "main"
      branch = name.split('...')[0] || null;
      hasUpstream = name.includes('...');
      const am = line.match(/ahead (\d+)/); if (am) ahead = Number(am[1]);
      const bm = line.match(/behind (\d+)/); if (bm) behind = Number(bm[1]);
      continue;
    }
    changes++;
  }
  return { isRepo: true, branch, changes, ahead, behind, hasUpstream };
}

export function registerGitIpc() {
  ipcMain.handle('git:info', (_evt, root: string) => getInfo(root));

  ipcMain.handle('git:branches', async (_evt, root: string): Promise<string[]> => {
    const res = await runGit(['branch', '--format=%(refname:short)'], root);
    if (res.code !== 0) return [];
    return res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  });

  ipcMain.handle('git:checkout', async (_evt, root: string, branch: string) => {
    const res = await runGit(['checkout', branch], root);
    if (res.code !== 0) {
      const msg = (res.stderr || res.stdout).trim() || 'Falha ao trocar de branch.';
      return { ok: false as const, error: msg };
    }
    return { ok: true as const };
  });

  ipcMain.handle('git:status', async (_evt, root: string) => {
    const res = await runGit(['status', '--porcelain=v1', '--branch'], root);
    if (res.code !== 0) {
      return { isRepo: false, branch: null as string | null, ahead: 0, behind: 0, files: [] as GitFile[] };
    }
    let branch: string | null = null;
    let ahead = 0;
    let behind = 0;
    const files: GitFile[] = [];
    for (const line of res.stdout.split('\n')) {
      if (!line) continue;
      if (line.startsWith('## ')) {
        let head = line.slice(3);
        const sp = head.indexOf(' ');
        if (sp >= 0) head = head.slice(0, sp);
        branch = head.split('...')[0] || null;
        const am = line.match(/ahead (\d+)/);
        const bm = line.match(/behind (\d+)/);
        if (am) ahead = Number(am[1]);
        if (bm) behind = Number(bm[1]);
        continue;
      }
      const index = line[0];
      const work = line[1];
      let p = line.slice(3);
      if (p.includes(' -> ')) p = p.split(' -> ')[1];
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
      files.push({ path: p, index, work });
    }
    return { isRepo: true, branch, ahead, behind, files };
  });

  ipcMain.handle('git:stage', async (_evt, root: string, paths: string[]) => {
    if (!paths.length) return { ok: true as const };
    const res = await runGit(['add', '--', ...paths], root);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() };
    return { ok: true as const };
  });

  ipcMain.handle('git:unstage', async (_evt, root: string, paths: string[]) => {
    if (!paths.length) return { ok: true as const };
    const res = await runGit(['reset', '-q', 'HEAD', '--', ...paths], root);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() };
    return { ok: true as const };
  });

  ipcMain.handle('git:commit', async (_evt, root: string, message: string) => {
    const msg = message.trim();
    if (!msg) return { ok: false as const, error: 'Mensagem de commit vazia.' };
    const res = await runGit(['commit', '-m', msg], root);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha no commit.' };
    return { ok: true as const };
  });

  ipcMain.handle('git:diff', async (_evt, root: string, staged: boolean): Promise<string> => {
    const args = staged ? ['diff', '--staged'] : ['diff'];
    const res = await runGit(args, root);
    return res.code === 0 ? res.stdout : '';
  });

  ipcMain.handle('git:push', async (_evt, root: string) => {
    const res = await runGit(['push'], root, GIT_NET_TIMEOUT_MS);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha no push.' };
    return { ok: true as const };
  });

  ipcMain.handle('git:pull', async (_evt, root: string) => {
    const res = await runGit(['pull'], root, GIT_NET_TIMEOUT_MS);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha no pull.' };
    return { ok: true as const };
  });

  // Atualiza as refs do remoto (origin) SEM mexer nos arquivos — alimenta o
  // "behind" do git:info, pra avisar que há commits novos no GitHub.
  ipcMain.handle('git:fetch', async (_evt, root: string) => {
    const res = await runGit(['fetch', '--quiet'], root, GIT_NET_TIMEOUT_MS);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha no fetch.' };
    return { ok: true as const };
  });

  // ===== Git worktrees (agentes isolados no mesmo repo) =====
  ipcMain.handle('git:worktreeList', async (_evt, root: string): Promise<Array<{ path: string; branch: string | null }>> => {
    const res = await runGit(['worktree', 'list', '--porcelain'], root);
    if (res.code !== 0) return [];
    const list: Array<{ path: string; branch: string | null }> = [];
    let cur: { path: string; branch: string | null } | null = null;
    for (const line of res.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (cur) list.push(cur);
        cur = { path: line.slice(9).trim(), branch: null };
      } else if (line.startsWith('branch ') && cur) {
        cur.branch = line.slice(7).trim().replace('refs/heads/', '');
      }
    }
    if (cur) list.push(cur);
    return list;
  });

  ipcMain.handle('git:worktreeAdd', async (_evt, root: string, name: string) => {
    const branch = (name || '').trim().replace(/\s+/g, '-').replace(/[^\w./-]/g, '').replace(/^[-/]+|[-/]+$/g, '');
    if (!branch) return { ok: false as const, error: 'Nome inválido para a branch.' };
    const top = await runGit(['rev-parse', '--show-toplevel'], root);
    if (top.code !== 0) return { ok: false as const, error: 'Esta pasta não é um repositório git.' };
    const repoRoot = top.stdout.trim() || root;
    const repoName = path.basename(repoRoot);
    const wtParent = path.join(path.dirname(repoRoot), `${repoName}.worktrees`);
    const wtPath = path.join(wtParent, branch.replace(/\//g, '-'));
    if (fs.existsSync(wtPath)) return { ok: false as const, error: 'Já existe um worktree com esse nome.' };
    try { fs.mkdirSync(wtParent, { recursive: true }); } catch { /* ignore */ }
    const branchExists = (await runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot)).code === 0;
    const args = branchExists ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', wtPath, '-b', branch];
    const res = await runGit(args, repoRoot);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha ao criar o worktree.' };
    return { ok: true as const, path: wtPath, branch };
  });

  ipcMain.handle('git:worktreeRemove', async (_evt, root: string, wtPath: string) => {
    const res = await runGit(['worktree', 'remove', '--force', wtPath], root);
    if (res.code !== 0) return { ok: false as const, error: (res.stderr || res.stdout).trim() || 'Falha ao remover o worktree.' };
    return { ok: true as const };
  });
}
