// Mede uso de CPU/memória da ÁRVORE de processos de um PTY (shell + node/claude
// filhos).
//
// No Windows 11 recente a Microsoft REMOVEU o `wmic` — e tanto `pidusage` quanto
// `pidtree` dependem dele (falham com "spawn wmic ENOENT"), zerando as métricas.
// Então no Windows fazemos UM snapshot por ciclo via PowerShell
// (Get-CimInstance Win32_Process), que entrega PID, PPID, working set e tempos de
// CPU (kernel+user, em unidades de 100 ns). Fora do Windows, `pidtree`+`pidusage`
// funcionam normalmente e são usados como antes.
import { execFile } from 'child_process';

export interface TreeUsage {
  id: string;
  /** RSS / working set somado (bytes). */
  mem: number;
  /** CPU% somado da árvore (pode passar de 100 em multi-core). */
  cpu: number;
  /** Quantidade de processos medidos. */
  count: number;
}

const isWin = process.platform === 'win32';

// ----- Fora do Windows: pidtree + pidusage (puro-JS, sem wmic) -----
let pidusage: ((pids: number | number[]) => Promise<Record<string, { cpu: number; memory: number } | undefined>>) | null = null;
let pidtree: ((pid: number) => Promise<number[]>) | null = null;
if (!isWin) {
  try {
    pidusage = require('pidusage');
    pidtree = require('pidtree');
  } catch { /* opcional */ }
}

// ----- Windows: snapshot único via PowerShell -----
interface WinProc { ppid: number; mem: number; cpu: bigint; }
interface WinSnap { procs: Map<number, WinProc>; children: Map<number, number[]>; }
const winPrev = new Map<string, { cpuTime: bigint; ts: number }>();

const PS_CMD =
  'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ' +
  'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.WorkingSetSize)|$($_.KernelModeTime)|$($_.UserModeTime)" }';

function winSnapshot(): Promise<WinSnap> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_CMD],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const procs = new Map<number, WinProc>();
        const children = new Map<number, number[]>();
        if (!err && stdout) {
          for (const line of stdout.split(/\r?\n/)) {
            const p = line.split('|');
            if (p.length < 5) continue;
            const pid = Number(p[0]);
            const ppid = Number(p[1]);
            const mem = Number(p[2]);
            if (!Number.isFinite(pid)) continue;
            let cpu = 0n;
            try { cpu = BigInt((p[3] || '0').trim()) + BigInt((p[4] || '0').trim()); } catch { cpu = 0n; }
            procs.set(pid, { ppid, mem: Number.isFinite(mem) ? mem : 0, cpu });
            const arr = children.get(ppid);
            if (arr) arr.push(pid); else children.set(ppid, [pid]);
          }
        }
        resolve({ procs, children });
      },
    );
  });
}

/** Soma mem (bytes) e cpuTime (100 ns) da árvore de `rootPid` no snapshot. */
function winTree(rootPid: number, snap: WinSnap): { mem: number; cpuTime: bigint; count: number } {
  let mem = 0, count = 0;
  let cpuTime = 0n;
  const stack = [rootPid];
  const seen = new Set<number>();
  while (stack.length) {
    const pid = stack.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const info = snap.procs.get(pid);
    if (!info) continue;
    mem += info.mem;
    cpuTime += info.cpu;
    count++;
    const kids = snap.children.get(pid);
    if (kids) for (const k of kids) if (!seen.has(k)) stack.push(k);
  }
  return { mem, cpuTime, count };
}

/** Mede a árvore de processos de cada terminal. Uma única varredura por ciclo. */
export async function sampleTrees(entries: { id: string; pid: number }[]): Promise<TreeUsage[]> {
  if (entries.length === 0) return [];

  if (isWin) {
    const snap = await winSnapshot();
    const now = Date.now();
    const live = new Set(entries.map((e) => e.id));
    const out: TreeUsage[] = [];
    for (const { id, pid } of entries) {
      const { mem, cpuTime, count } = winTree(pid, snap);
      const prev = winPrev.get(id);
      let cpu = 0;
      if (prev) {
        const dt = now - prev.ts;              // ms decorridos desde a última amostra
        const dCpu = cpuTime - prev.cpuTime;   // delta de tempo de CPU (100 ns)
        // 100 ns → ms (÷1e4); fração do tempo decorrido usada em CPU → %.
        if (dt > 0 && dCpu > 0n) cpu = (Number(dCpu) / 1e4) / dt * 100;
      }
      winPrev.set(id, { cpuTime, ts: now });
      out.push({ id, mem, cpu: Math.max(0, Math.round(cpu * 10) / 10), count });
    }
    // Esquece terminais que sumiram (evita vazar estado).
    for (const k of [...winPrev.keys()]) if (!live.has(k)) winPrev.delete(k);
    return out;
  }

  // macOS / Linux: pidtree + pidusage por PID (em paralelo).
  if (!pidusage || !pidtree) return entries.map((e) => ({ id: e.id, mem: 0, cpu: 0, count: 0 }));
  return Promise.all(entries.map(async ({ id, pid }) => {
    let pids = [pid];
    try { pids = [pid, ...(await pidtree!(pid))]; } catch { /* só a raiz */ }
    let stats: Record<string, { cpu: number; memory: number } | undefined> = {};
    try { stats = await pidusage!(pids); } catch { /* algum PID morreu */ }
    let mem = 0, cpu = 0, count = 0;
    for (const v of Object.values(stats)) { if (!v) continue; mem += v.memory; cpu += v.cpu; count++; }
    return { id, mem, cpu, count };
  }));
}
