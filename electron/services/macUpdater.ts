import { app, BrowserWindow, net, shell } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { UpdateStatus } from '../../shared/types';

const pExec = promisify(execFile);

/** Repo PÚBLICO de onde os releases são baixados (sem token). */
const REPO = 'cbjuniiior/voltz-ide';

/**
 * Auto-update do macOS SEM assinatura Apple (não usa Squirrel.Mac, que exigiria
 * Developer ID). Fluxo: checa o GitHub → baixa o .dmg em background → na hora de
 * instalar tenta o "Nível 2" (monta o dmg, tira a quarentena, troca o próprio
 * .app e reabre sozinho) e, se qualquer passo falhar, cai no "Nível 1" (abre o
 * instalador para o usuário arrastar). Reaproveita o mesmo IPC/UI do Windows.
 */

function log(msg: string) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'voltz-diag.log'),
      `[${new Date().toISOString()}] mac-update: ${msg}\n`,
    );
  } catch { /* ignore */ }
}

function broadcast(status: UpdateStatus) {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('updates:status', status); } catch { /* janela fechando */ }
  }
}

interface GhAsset { name: string; browser_download_url: string; state?: string }

/** GET JSON via net (segue redirects, usa certificados/proxy do sistema). */
function httpJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('User-Agent', 'voltz-ide-updater');
    req.setHeader('Accept', 'application/vnd.github+json');
    req.on('response', (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 400) { reject(new Error(`HTTP ${code} em ${url}`)); return; }
      let body = '';
      res.on('data', (c) => { body += c.toString(); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/** Baixa um arquivo grande com progresso. */
function download(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('User-Agent', 'voltz-ide-updater');
    req.on('response', (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 400) { reject(new Error(`HTTP ${code} ao baixar`)); return; }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const out = fs.createWriteStream(dest);
      out.on('error', reject);
      // O net.IncomingMessage do Electron não é um Node stream (sem pause/pipe);
      // o WriteStream bufferiza e a rede costuma ser o gargalo, então write() basta.
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        out.write(chunk);
        if (total) onProgress(Math.max(0, Math.min(100, Math.round((received / total) * 100))));
      });
      res.on('end', () => out.end(() => resolve()));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/** remoto > local? (semver simples x.y.z). */
function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map((n) => parseInt(n, 10) || 0);
  const b = local.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function pickDmg(assets: GhAsset[]): GhAsset | null {
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name) && a.state !== 'uploading');
  if (!dmgs.length) return null;
  const re = process.arch === 'arm64' ? /arm64/i : /(x64|x86_64|intel)/i;
  return dmgs.find((a) => re.test(a.name))
    ?? dmgs.find((a) => !/arm64|x64|x86_64|intel/i.test(a.name)) // build universal
    ?? dmgs[0];
}

function updatesDir(): string {
  const d = path.join(app.getPath('userData'), 'updates');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ }
  return d;
}

/** Caminho do .app instalado a partir do executável atual. */
function currentAppBundle(): string {
  const exe = app.getPath('exe'); // .../Voltz IDE.app/Contents/MacOS/Voltz IDE
  const idx = exe.indexOf('.app/');
  if (idx === -1) throw new Error('app não está empacotado como .app');
  return exe.slice(0, idx + 4);
}

/** Aspas seguras para caminho em shell. */
function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

let availableVersion: string | null = null;
let downloadedPath: string | null = null;
let checking = false;

/** Checa o GitHub e baixa o .dmg novo (se houver). */
export async function macCheckForUpdates(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    broadcast({ state: 'checking' });
    const rel = await httpJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    const tag = String(rel?.tag_name ?? '').replace(/^v/, '');
    if (!tag || !isNewer(tag, app.getVersion())) { broadcast({ state: 'idle' }); return; }
    availableVersion = tag;

    // Já baixado nesta sessão? não rebaixa.
    if (downloadedPath && fs.existsSync(downloadedPath) && downloadedPath.includes(tag)) {
      broadcast({ state: 'ready', version: tag });
      return;
    }

    const asset = pickDmg(rel.assets ?? []);
    if (!asset) { broadcast({ state: 'error', message: `Sem instalador .dmg para ${process.arch}` }); return; }

    log(`baixando ${asset.name} (v${tag})`);
    broadcast({ state: 'downloading', percent: 0, version: tag });
    const dest = path.join(updatesDir(), asset.name);
    await download(asset.browser_download_url, dest, (pct) => broadcast({ state: 'downloading', percent: pct, version: tag }));
    downloadedPath = dest;
    log(`baixado em ${dest}`);
    broadcast({ state: 'ready', version: tag });
  } catch (e: any) {
    log(`falha no check/download: ${e?.message ?? e}`);
    broadcast({ state: 'error', message: String(e?.message ?? e) });
  } finally {
    checking = false;
  }
}

/** Instala a atualização: tenta o Nível 2 (auto-swap) e cai no Nível 1 (abrir). */
export async function macInstallUpdate(): Promise<void> {
  if (!downloadedPath || !fs.existsSync(downloadedPath)) {
    log('sem dmg baixado — fallback para abrir release');
    await fallbackOpen();
    return;
  }
  try {
    await level2SelfReplace(downloadedPath);
  } catch (e: any) {
    log(`Nível 2 falhou (${e?.message ?? e}) → Nível 1 (abrir instalador)`);
    await fallbackOpen();
  }
}

/** Nível 2: monta o dmg, copia o .app, tira a quarentena, troca e reabre. */
async function level2SelfReplace(dmg: string): Promise<void> {
  const installApp = currentAppBundle();
  // Sem permissão de escrita na pasta destino → vai direto pro fallback.
  await fsp.access(path.dirname(installApp), fs.constants.W_OK);

  const mnt = path.join(os.tmpdir(), `voltz-mnt-${Date.now()}`);
  await fsp.mkdir(mnt, { recursive: true });
  let staged: string | null = null;
  try {
    await pExec('hdiutil', ['attach', dmg, '-nobrowse', '-noverify', '-noautoopen', '-mountpoint', mnt], { timeout: 120_000 });
    const entries = await fsp.readdir(mnt);
    const appName = entries.find((e) => e.endsWith('.app'));
    if (!appName) throw new Error('.app não encontrado no dmg');
    // Copia para fora do dmg (precisa existir depois do detach).
    staged = path.join(os.tmpdir(), `voltz-stage-${Date.now()}.app`);
    await pExec('ditto', [path.join(mnt, appName), staged], { timeout: 120_000 });
  } finally {
    await pExec('hdiutil', ['detach', mnt, '-quiet']).catch(() => {});
    await fsp.rm(mnt, { recursive: true, force: true }).catch(() => {});
  }
  if (!staged) throw new Error('cópia do app falhou');
  await pExec('xattr', ['-dr', 'com.apple.quarantine', staged]).catch(() => {});

  // Script que espera o app fechar, troca o bundle (com backup/restore) e reabre.
  const sh = `#!/bin/bash
APP=${q(installApp)}
NEW=${q(staged)}
BAK="$APP.voltz-bak"
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
rm -rf "$BAK"
mv "$APP" "$BAK" 2>/dev/null || true
if ditto "$NEW" "$APP"; then
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
  rm -rf "$BAK" "$NEW"
else
  rm -rf "$APP"; mv "$BAK" "$APP" 2>/dev/null || true
fi
open "$APP"
`;
  const scriptPath = path.join(os.tmpdir(), `voltz-swap-${Date.now()}.sh`);
  await fsp.writeFile(scriptPath, sh, { mode: 0o755 });
  log('Nível 2: trocando o app e reiniciando');
  const child = spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  setImmediate(() => app.quit());
}

/** Nível 1: abre o .dmg baixado (janela de arrastar) ou a página do release. */
async function fallbackOpen(): Promise<void> {
  if (downloadedPath && fs.existsSync(downloadedPath)) {
    await shell.openPath(downloadedPath);
  } else {
    await shell.openExternal(`https://github.com/${REPO}/releases/latest`);
  }
  // Mantém o banner como "pronto" para o usuário concluir a instalação manual.
  broadcast({ state: 'ready', version: availableVersion ?? undefined, message: 'manual' });
}
