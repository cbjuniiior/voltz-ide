import { ipcMain, BrowserWindow } from 'electron';
import { getPtyPid, listPtyIds } from '../services/ptyManager';
import { sampleTrees, type TreeUsage } from '../services/procSampler';
import type { ProcSample } from '../../shared/types';

// Um único timer global mede todos os terminais com UMA varredura por ciclo
// (no Windows, um snapshot PowerShell; em Unix, pidtree+pidusage por PID).
let timer: ReturnType<typeof setInterval> | null = null;
const lastActive = new Map<string, { cpu: number; ts: number }>();
const ACTIVE_CPU = 3;          // % acima disso = "trabalhando"
const ACTIVE_WINDOW_MS = 4000; // janela em que conta como atividade recente
const INTERVAL_MS = 2000;

function toSample(u: TreeUsage): ProcSample {
  const now = Date.now();
  const prev = lastActive.get(u.id);
  const recent = !!prev && (now - prev.ts) < ACTIVE_WINDOW_MS && prev.cpu > ACTIVE_CPU;
  const active = u.cpu > ACTIVE_CPU || recent;
  if (u.cpu > ACTIVE_CPU) lastActive.set(u.id, { cpu: u.cpu, ts: now });
  return { terminalId: u.id, memBytes: u.mem, cpuPercent: u.cpu, active, procCount: u.count, ts: now };
}

export function startProcMonitor(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('procMonitor:sampleNow', async (_e, terminalId: string) => {
    const pid = getPtyPid(terminalId);
    if (!pid) return null;
    try {
      const [u] = await sampleTrees([{ id: terminalId, pid }]);
      return u ? toSample(u) : null;
    } catch { return null; }
  });

  if (timer) return;
  let running = false; // evita sobreposição se uma varredura demorar mais que o intervalo
  timer = setInterval(() => {
    const w = getWindow();
    if (!w || w.isDestroyed() || running) return;
    running = true;
    void (async () => {
      try {
        const entries: { id: string; pid: number }[] = [];
        for (const id of listPtyIds()) {
          const pid = getPtyPid(id);
          if (pid) entries.push({ id, pid });
        }
        if (!entries.length) return;
        const usages = await sampleTrees(entries);
        if (w.isDestroyed()) return;
        for (const u of usages) w.webContents.send('procMonitor:sample', toSample(u));
      } catch { /* nunca derruba o loop */ }
      finally { running = false; }
    })();
  }, INTERVAL_MS);
}

export function stopProcMonitor() {
  if (timer) { clearInterval(timer); timer = null; }
}
