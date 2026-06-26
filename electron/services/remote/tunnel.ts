import { spawn, type ChildProcess } from 'node:child_process';
import { app, net } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// (?!api\.) descarta o endpoint api.trycloudflare.com que o cloudflared loga
// ANTES da URL real do túnel — senão pegávamos o subdomínio errado.
const CF_URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;
const ASSET: Record<string, string | undefined> = {
  win32: 'cloudflared-windows-amd64.exe',
  darwin: 'cloudflared-darwin-amd64.tgz', // (mac normalmente instala via brew; baixa só Windows)
  linux: 'cloudflared-linux-amd64',
};

/**
 * Cria um túnel público (Cloudflare quick tunnel) para um `localhost:porta`,
 * devolvendo uma URL `https://*.trycloudflare.com` — funciona de qualquer lugar,
 * sem conta. Baixa o binário `cloudflared` sozinho na 1ª vez (sem instalação).
 */
export class TunnelManager {
  private proc: ChildProcess | null = null;
  private active: { port: number; url: string } | null = null;

  current(): { port: number; url: string } | null { return this.active; }

  /** Caminho do cloudflared: PATH conhecido (userData/bin) ou baixa. */
  private async resolveBin(): Promise<string> {
    const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const local = path.join(app.getPath('userData'), 'bin', exe);
    if (fs.existsSync(local)) return local;
    if (process.platform !== 'win32') return 'cloudflared'; // mac/linux: brew/pkg
    const asset = ASSET.win32!;
    await fsp.mkdir(path.dirname(local), { recursive: true });
    await this.download(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`, local);
    return local;
  }

  private download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = net.request(url); // o net do Electron segue redirects por padrão
      req.on('response', (res) => {
        if ((res.statusCode ?? 0) >= 400) { reject(new Error('download falhou: HTTP ' + res.statusCode)); return; }
        const out = fs.createWriteStream(dest);
        (res as unknown as NodeJS.ReadableStream).pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }

  /** Sobe um túnel para localhost:porta e resolve com a URL pública. */
  async start(port: number): Promise<string> {
    this.stop();
    const bin = await this.resolveBin();
    return new Promise<string>((resolve, reject) => {
      // --http-host-header localhost: faz a origem receber Host: localhost (que
      // todo dev server aceita), driblando o server.allowedHosts do Vite — senão
      // o navegador no celular leva um "Blocked request: host not allowed".
      const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--http-host-header', 'localhost', '--url', `http://localhost:${port}`], { windowsHide: true });
      this.proc = proc;
      let settled = false;
      const onData = (d: Buffer) => {
        const m = CF_URL_RE.exec(d.toString());
        if (m && !settled) { settled = true; this.active = { port, url: m[0] }; resolve(m[0]); }
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      proc.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
      proc.on('close', () => {
        if (this.proc === proc) { this.proc = null; this.active = null; }
        if (!settled) { settled = true; reject(new Error('cloudflared encerrou sem gerar URL')); }
      });
      setTimeout(() => { if (!settled) { settled = true; this.stop(); reject(new Error('a Cloudflare demorou demais para responder')); } }, 45000);
    });
  }

  stop(): void {
    if (this.proc) { try { this.proc.kill(); } catch { /* ignore */ } this.proc = null; }
    this.active = null;
  }
}
