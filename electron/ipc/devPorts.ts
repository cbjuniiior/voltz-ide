// Descobre TODOS os processos que estão "servindo" no PC (portas TCP em LISTEN),
// não só os que o app iniciou — pega dev servers órfãos de sessões anteriores ou
// iniciados fora do app. Permite matar a árvore do processo pela porta.
import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';

export interface DevPort {
  pid: number;
  name: string;
  cmd: string;
  ports: number[];
}

const isWin = process.platform === 'win32';

function pwsh(cmd: string, maxBuffer = 24 * 1024 * 1024): Promise<string> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { maxBuffer, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : (stdout || ''));
    });
  });
}

// Runtimes que quase sempre são "dev server" quando escutam numa porta local.
const DEV_RUNTIME_RE = /^(node|bun|deno|python3?|pythonw|ruby|php|dotnet|java|caddy|http-server|serve|vite|next)/i;
// Pistas no command line para outros processos.
const DEV_CMD_RE = /vite|next|nuxt|webpack|ng serve|react-scripts|astro|remix|gatsby|parcel|turbo|nodemon|ts-node|tsx |\bdev\b|--port|localhost|http-server|live-server|\bserve\b/i;

function looksDev(name: string, cmd: string): boolean {
  if (DEV_RUNTIME_RE.test(name.replace(/\.exe$/i, ''))) return true;
  return DEV_CMD_RE.test(cmd || '');
}

async function scanWindows(): Promise<DevPort[]> {
  // 1. Portas em LISTEN locais → "pid|port".
  const portsOut = await pwsh(
    "Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -in '0.0.0.0','127.0.0.1','::','::1' -and $_.LocalPort -ge 1024 } | ForEach-Object { \"$($_.OwningProcess)|$($_.LocalPort)\" }",
  );
  const portsByPid = new Map<number, Set<number>>();
  for (const line of portsOut.split(/\r?\n/)) {
    const [a, b] = line.split('|');
    const pid = Number(a), port = Number(b);
    if (!pid || !port) continue;
    let set = portsByPid.get(pid);
    if (!set) { set = new Set(); portsByPid.set(pid, set); }
    set.add(port);
  }
  if (portsByPid.size === 0) return [];

  // 2. Nome + command line de cada processo.
  const procOut = await pwsh('Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.Name)|$($_.CommandLine)" }');
  const info = new Map<number, { name: string; cmd: string }>();
  for (const line of procOut.split(/\r?\n/)) {
    const i1 = line.indexOf('|'); if (i1 < 0) continue;
    const i2 = line.indexOf('|', i1 + 1); if (i2 < 0) continue;
    const pid = Number(line.slice(0, i1));
    if (!pid) continue;
    info.set(pid, { name: line.slice(i1 + 1, i2), cmd: line.slice(i2 + 1) });
  }

  // 3. Junta + filtra os que parecem dev server.
  const out: DevPort[] = [];
  for (const [pid, ports] of portsByPid) {
    const pi = info.get(pid);
    if (!pi || !looksDev(pi.name, pi.cmd)) continue;
    out.push({ pid, name: pi.name, cmd: pi.cmd, ports: [...ports].sort((x, y) => x - y) });
  }
  return out.sort((a, b) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0));
}

async function scanUnix(): Promise<DevPort[]> {
  return new Promise((resolve) => {
    execFile('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) { resolve([]); return; }
      const byPid = new Map<number, { name: string; ports: Set<number> }>();
      for (const line of stdout.split('\n').slice(1)) {
        const cols = line.split(/\s+/);
        if (cols.length < 9) continue;
        const name = cols[0]; const pid = Number(cols[1]); const addr = cols[8];
        const m = addr.match(/:(\d+)$/);
        if (!pid || !m) continue;
        const port = Number(m[1]);
        if (port < 1024) continue;
        let e = byPid.get(pid);
        if (!e) { e = { name, ports: new Set() }; byPid.set(pid, e); }
        e.ports.add(port);
      }
      const out: DevPort[] = [];
      for (const [pid, e] of byPid) {
        if (!looksDev(e.name, '')) continue;
        out.push({ pid, name: e.name, cmd: '', ports: [...e.ports].sort((x, y) => x - y) });
      }
      resolve(out.sort((a, b) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0)));
    });
  });
}

function killWindows(pid: number): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (err) => {
      resolve(err ? { ok: false, error: err.message } : { ok: true });
    });
  });
}

export function registerDevPortsIpc() {
  ipcMain.handle('devPorts:scan', async (): Promise<DevPort[]> => {
    try { return isWin ? await scanWindows() : await scanUnix(); }
    catch { return []; }
  });

  ipcMain.handle('devPorts:kill', async (_e, pid: number): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: 'PID inválido' };
    if (pid === process.pid) return { ok: false, error: 'Não posso encerrar o próprio app' };
    if (isWin) return killWindows(pid);
    try { process.kill(pid, 'SIGKILL'); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });
}
