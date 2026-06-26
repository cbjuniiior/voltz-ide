import { useEffect, useRef, useState } from 'react';
import { Cpu, MemoryStick, Zap, Loader2, X } from 'lucide-react';
import { toast } from '@/stores/toasts';

interface Metrics { cpu: number; mem: { used: number; total: number; percent: number }; cores: number; }

function fmtGB(b: number): string { return (b / 1073741824).toFixed(1); }
function colorFor(p: number): string { return p >= 85 ? 'var(--danger)' : p >= 60 ? 'var(--warning)' : 'var(--success)'; }

/** Anel de progresso (gauge). */
function Ring({ pct, size, stroke, color }: { pct: number; size: number; stroke: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-active)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

/** Gauges de CPU/RAM na toolbar + dropdown detalhado com botão "Otimizar". */
export function SystemGraph() {
  const [m, setM] = useState<Metrics>({ cpu: 0, mem: { used: 0, total: 1, percent: 0 }, cores: 0 });
  const [open, setOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const r = await window.api.system.metrics(); if (alive) setM(r); } catch { /* ignore */ }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function optimize() {
    if (optimizing) return;
    setOptimizing(true);
    try {
      const r = await window.api.system.optimize();
      const freed = r.freedBytes / 1048576;
      if (freed >= 1) toast.success('Memória otimizada', `Liberados ~${Math.round(freed)} MB de RAM`);
      else toast.success('Memória otimizada', 'O sistema já estava enxuto');
    } catch { toast.error('Não consegui otimizar a memória'); }
    setOptimizing(false);
  }

  const cpu = m.cpu, mem = m.mem.percent;
  const cpuC = colorFor(cpu), memC = colorFor(mem);

  return (
    <div ref={ref} className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Sistema — clique para detalhes e otimizar"
        className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1 transition-colors hover:border-border-default"
        style={{ background: open ? 'var(--bg-active)' : undefined }}
      >
        <span className="flex items-center gap-1.5">
          <span className="relative flex items-center justify-center" style={{ width: 20, height: 20 }}>
            <Ring pct={cpu} size={20} stroke={2.5} color={cpuC} />
            <Cpu size={9} className="absolute" style={{ color: cpuC }} />
          </span>
          <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: cpuC }}>{cpu}%</span>
        </span>
        <span className="h-4 w-px bg-border-subtle" />
        <span className="flex items-center gap-1.5">
          <span className="relative flex items-center justify-center" style={{ width: 20, height: 20 }}>
            <Ring pct={mem} size={20} stroke={2.5} color={memC} />
            <MemoryStick size={9} className="absolute" style={{ color: memC }} />
          </span>
          <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: memC }}>{mem}%</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1.5 w-64 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Sistema</span>
            <button onClick={() => setOpen(false)} className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><X size={12} /></button>
          </div>
          <div className="flex items-start justify-around px-3 py-3">
            <GaugeBig pct={cpu} color={cpuC} icon={<Cpu size={13} />} label="CPU" sub={`${m.cores} núcleos`} />
            <GaugeBig pct={mem} color={memC} icon={<MemoryStick size={13} />} label="RAM" sub={`${fmtGB(m.mem.used)} / ${fmtGB(m.mem.total)} GB`} />
          </div>
          <div className="border-t border-border-subtle p-2.5">
            <button
              onClick={() => void optimize()}
              disabled={optimizing}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-semibold transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)', boxShadow: '0 2px 10px -3px color-mix(in srgb, var(--accent) 60%, transparent)' }}
            >
              {optimizing
                ? <><Loader2 size={14} className="animate-spin" /> Otimizando…</>
                : <><Zap size={14} fill="currentColor" /> Otimizar memória</>}
            </button>
            <p className="mt-1.5 text-center text-[9.5px] leading-relaxed text-text-muted">
              Limpa caches e devolve ao sistema a memória inativa reservada.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GaugeBig({ pct, color, icon, label, sub }: { pct: number; color: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: 62, height: 62 }}>
        <Ring pct={pct} size={62} stroke={6} color={color} />
        <div className="absolute flex flex-col items-center leading-none">
          <span style={{ color }}>{icon}</span>
          <span className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-text-primary">{pct}%</span>
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</span>
      <span className="text-[9.5px] tabular-nums text-text-muted">{sub}</span>
    </div>
  );
}
