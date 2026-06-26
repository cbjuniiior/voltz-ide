import { execFile } from 'node:child_process';
import { listPtys, getPtyPid } from '../ptyManager';

interface Proc { pid: number; ppid: number; cmd: string }

/** Snapshot de PID|PPID|CommandLine de todos os processos. */
function snapshot(): Promise<Proc[]> {
  return new Promise((resolve) => {
    const done = (out: string, sep: RegExp) => {
      const procs: Proc[] = [];
      for (const line of out.split(sep)) {
        const i1 = line.indexOf('|'); if (i1 < 0) continue;
        const i2 = line.indexOf('|', i1 + 1); if (i2 < 0) continue;
        const pid = Number(line.slice(0, i1)), ppid = Number(line.slice(i1 + 1, i2));
        if (pid) procs.push({ pid, ppid, cmd: line.slice(i2 + 1) });
      }
      resolve(procs);
    };
    if (process.platform === 'win32') {
      const ps = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
        { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 15000 },
        (err, out) => (err ? resolve([]) : done(out, /\r?\n/)));
    } else {
      // pid ppid args → normaliza para pid|ppid|args
      execFile('ps', ['-axo', 'pid=,ppid=,args='], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        const norm = out.split('\n').map((l) => {
          const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
          return m ? `${m[1]}|${m[2]}|${m[3]}` : '';
        }).join('\n');
        done(norm, /\n/);
      });
    }
  });
}

/**
 * Conjunto de terminalIds que têm um processo `claude` na árvore — sinal
 * DETERMINÍSTICO de "este terminal está rodando o Claude Code" (não depende
 * de raspar o output, ao contrário do claudeWatch).
 */
export async function scanClaudeTerminals(): Promise<Set<string>> {
  const procs = await snapshot();
  const result = new Set<string>();
  if (!procs.length) return result;

  const children = new Map<number, number[]>();
  const cmdByPid = new Map<number, string>();
  for (const p of procs) {
    cmdByPid.set(p.pid, p.cmd);
    const arr = children.get(p.ppid) ?? [];
    arr.push(p.pid);
    children.set(p.ppid, arr);
  }

  for (const { id } of listPtys()) {
    const root = getPtyPid(id);
    if (!root) continue;
    const stack = [root];
    const seen = new Set<number>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const cmd = (cmdByPid.get(cur) ?? '').toLowerCase();
      // claude.exe, ou node rodando @anthropic-ai/claude-code, ou bun x claude…
      if (cmd.includes('claude')) { result.add(id); break; }
      for (const c of children.get(cur) ?? []) stack.push(c);
    }
  }
  return result;
}
