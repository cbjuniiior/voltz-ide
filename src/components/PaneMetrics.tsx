import { MemoryStick, Cpu } from 'lucide-react';
import { useProcMonitorStore } from '@/stores/procMonitor';

/** Bytes → { valor, unidade }. */
function fmtMem(bytes: number): { val: string; unit: string } {
  const mb = bytes / 1048576;
  if (mb >= 1024) return { val: (mb / 1024).toFixed(1), unit: 'GB' };
  return { val: String(Math.max(0, Math.round(mb))), unit: 'MB' };
}

/** Recursos do terminal (MEM · CPU) — só os números; o estado vai no badge ao lado do nome. */
export function PaneMetrics({ terminalId }: { terminalId: string | null }) {
  const sample = useProcMonitorStore((s) => (terminalId ? s.byTerminal[terminalId] : undefined));
  if (!terminalId) return null;

  const has = !!sample;
  const mem = has ? fmtMem(sample!.memBytes) : { val: '—', unit: '' };
  const cpu = has ? Math.round(sample!.cpuPercent) : 0;
  const cpuColor = cpu >= 150 ? 'var(--danger)' : cpu >= 60 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Stat icon={<MemoryStick size={13} strokeWidth={2} />} value={mem.val} unit={mem.unit} color="var(--info)" />
      <Stat icon={<Cpu size={13} strokeWidth={2} />} value={String(cpu)} unit="%" color={cpuColor} />
    </div>
  );
}

function Stat({ icon, value, unit, color }: { icon: React.ReactNode; value: string; unit: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-[5px]"
      style={{ background: 'var(--bg-base)', boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}
    >
      <span className="shrink-0" style={{ color }}>{icon}</span>
      <span className="flex items-baseline gap-0.5">
        <span className="font-mono text-[13px] font-bold leading-none tabular-nums text-text-primary">{value}</span>
        {unit && <span className="text-[9.5px] font-semibold text-text-muted">{unit}</span>}
      </span>
    </div>
  );
}
