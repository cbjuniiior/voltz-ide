import { ipcMain, shell, session } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Uso de CPU do sistema: os.cpus() dá tempos acumulados por núcleo, então
// calculamos a variação (delta) entre duas amostras. Guardamos a última para
// medir a utilização desde a chamada anterior (≈ uso médio no intervalo).
let lastCpu: { idle: number; total: number } | null = null;

function sampleCpu(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function cpuUsagePercent(): number {
  const cur = sampleCpu();
  const prev = lastCpu;
  lastCpu = cur;
  if (!prev) return 0; // primeira amostra: sem baseline
  const idleDiff = cur.idle - prev.idle;
  const totalDiff = cur.total - prev.total;
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
}

// OS-level integrations (open in file manager, reveal file, etc.).
// Kept here separately from `files` so it's clear the renderer is asking the
// OS to do something — not us reading/writing.

export function registerSystemIpc() {
  ipcMain.handle('system:openInExplorer', async (_evt, target: string) => {
    if (typeof target !== 'string' || !path.isAbsolute(target)) {
      return { ok: false as const, error: 'Caminho inválido.' };
    }
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) {
        const err = await shell.openPath(target);
        if (err) return { ok: false as const, error: err };
        return { ok: true as const };
      }
      // For files, reveal in the file manager rather than opening with the
      // default app — usually what the user wants from a "show in explorer".
      shell.showItemInFolder(target);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('system:metrics', async () => {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      cpu: Math.round(cpuUsagePercent()),
      mem: { used, total, percent: Math.round((used / total) * 100) },
      cores: os.cpus().length,
    };
  });

  // "Otimizar memória": limpa caches do app e, no Windows, devolve ao SO o working
  // set inativo de cada processo (EmptyWorkingSet) — libera RAM física reservada.
  ipcMain.handle('system:optimize', async () => {
    const before = os.totalmem() - os.freemem();
    try { await session.fromPartition('persist:voltz-browser').clearCache(); } catch { /* ignore */ }
    try { await session.defaultSession.clearCache(); } catch { /* ignore */ }
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const ps = 'Add-Type -Namespace Voltz -Name Mem -MemberDefinition \'[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);\'; Get-Process | ForEach-Object { try { [void][Voltz.Mem]::EmptyWorkingSet($_.Handle) } catch {} }';
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 25000 }, () => resolve());
      });
    }
    await new Promise((r) => setTimeout(r, 700));
    const after = os.totalmem() - os.freemem();
    return { beforeBytes: before, afterBytes: after, freedBytes: Math.max(0, before - after) };
  });
}
