import { ipcMain, net, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { GithubRepo } from '../../shared/types';

/**
 * Integração leve com o GitHub usando a conta JÁ conectada no computador:
 * o token vem do `git credential` (no macOS, do Keychain via osxkeychain).
 * Não guardamos nem expomos o token ao renderer — só o usamos no main process
 * para listar repos; o `git clone` reusa o mesmo credential helper.
 */

/** Lê o token do GitHub do credential helper do git (sem persistir nada). */
function getGithubToken(): Promise<string | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('git', ['credential', 'fill'], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* já morreu */ } resolve(null); }, 8000);
    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith('password='));
      resolve(line ? line.slice('password='.length).trim() || null : null);
    });
    child.stdin.write('protocol=https\nhost=github.com\n\n');
    child.stdin.end();
  });
}

interface GhResp { status: number; body: string; headers: Record<string, string | string[]> }

/** GET na API do GitHub (segue redirects, respeita proxy do sistema). */
function ghApi(pathOrUrl: string, token: string): Promise<GhResp> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('User-Agent', 'voltz-ide');
    req.setHeader('Authorization', `Bearer ${token}`);
    req.setHeader('Accept', 'application/vnd.github+json');
    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => { body += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers as Record<string, string | string[]> }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function getLogin(token: string): Promise<string | null> {
  try {
    const r = await ghApi('/user', token);
    if (r.status >= 400) return null;
    return JSON.parse(r.body)?.login ?? null;
  } catch {
    return null;
  }
}

function mapRepo(r: any): GithubRepo {
  return {
    fullName: String(r.full_name ?? ''),
    name: String(r.name ?? ''),
    owner: String(r.owner?.login ?? ''),
    description: r.description ?? null,
    private: !!r.private,
    defaultBranch: String(r.default_branch ?? 'main'),
    cloneUrl: String(r.clone_url ?? ''),
    sshUrl: String(r.ssh_url ?? ''),
    updatedAt: r.pushed_at ?? r.updated_at ?? null,
  };
}

/** Lista os repos do usuário (próprios, colaborador e de orgs), por atualização. */
async function listRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await ghApi(`/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`, token);
    if (r.status >= 400) break;
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const it of arr) repos.push(mapRepo(it));
    if (arr.length < 100) break;
  }
  return repos;
}

export function registerGithubIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('github:status', async () => {
    const token = await getGithubToken();
    if (!token) return { authenticated: false as const };
    const login = await getLogin(token);
    return login ? { authenticated: true as const, login } : { authenticated: false as const };
  });

  ipcMain.handle('github:listRepos', async () => {
    const token = await getGithubToken();
    if (!token) return { ok: false as const, error: 'Nenhuma conta GitHub conectada neste computador.' };
    try {
      return { ok: true as const, repos: await listRepos(token) };
    } catch (e) {
      return { ok: false as const, error: String((e as Error)?.message ?? e) };
    }
  });

  ipcMain.handle('github:clone', async (_e, cloneUrl: string, parentDir: string, name: string) => {
    const safe = (name || 'repo').replace(/[/\\]/g, '-').trim();
    if (!parentDir || !fs.existsSync(parentDir)) return { ok: false as const, error: 'Pasta de destino inválida.' };
    const dest = path.join(parentDir, safe);
    if (fs.existsSync(dest)) return { ok: false as const, error: `Já existe uma pasta "${safe}" no destino.` };

    return new Promise<{ ok: true; path: string } | { ok: false; error: string }>((resolve) => {
      let child;
      try {
        child = spawn('git', ['clone', '--progress', cloneUrl, dest], { windowsHide: true });
      } catch {
        resolve({ ok: false, error: 'git indisponível' });
        return;
      }
      let err = '';
      const send = (phase: string, percent: number) => {
        try { getWindow()?.webContents.send('github:cloneProgress', { phase, percent }); } catch { /* janela fechando */ }
      };
      const timer = setTimeout(() => { try { child.kill(); } catch { /* já morreu */ } resolve({ ok: false, error: 'Clone excedeu o tempo limite.' }); }, 600_000);
      child.stderr.on('data', (b) => {
        const s = b.toString('utf8');
        err += s;
        const m = /(Receiving objects|Resolving deltas|Counting objects|Compressing objects):\s+(\d+)%/.exec(s);
        if (m) send(m[1], Number(m[2]));
      });
      child.on('error', () => { clearTimeout(timer); resolve({ ok: false, error: 'git não encontrado' }); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ ok: true, path: dest });
        else resolve({ ok: false, error: err.trim().split('\n').filter(Boolean).pop() || 'Falha ao clonar.' });
      });
    });
  });
}
