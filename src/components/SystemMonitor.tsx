import { useEffect, useState } from 'react';
import type { SystemMetrics } from '@shared/types';

const POLL_MS = 2000;

/** Cor conforme a carga: verde (ok) → amarelo (atenção) → vermelho (alto). */
function loadColor(pct: number): string {
  if (pct >= 88) return 'var(--danger)';
  if (pct >= 65) return 'var(--warning)';
  return 'var(--success)';
}

function fmtGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/**
 * Monitor compacto de CPU/RAM para a Activity Bar (barra estreita) — dois
 * mini-anéis empilhados, com tooltip detalhado no hover.
 */
export function SystemMonitor() {
  const [m, setM] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const data = await window.api.system.metrics();
        if (alive) setM(data);
      } catch { /* ignore — janela fechando, etc. */ }
      if (alive) timer = setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const cpu = m?.cpu ?? 0;
  const memPct = m?.mem.percent ?? 0;

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <MiniGauge
        value={cpu}
        label="CPU"
        color={loadColor(cpu)}
        tooltip={m ? `CPU · ${cpu}% · ${m.cores} núcleos` : 'CPU'}
      />
      <MiniGauge
        value={memPct}
        label="RAM"
        color={loadColor(memPct)}
        tooltip={m ? `RAM · ${memPct}% · ${fmtGB(m.mem.used)}/${fmtGB(m.mem.total)} GB` : 'RAM'}
      />
    </div>
  );
}

/** Mini medidor circular com valor no centro e rótulo abaixo. */
function MiniGauge({
  value, label, color, tooltip,
}: {
  value: number;
  label: string;
  color: string;
  tooltip: string;
}) {
  const size = 38;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circ * (1 - pct / 100);

  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-active)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold leading-none tabular-nums text-text-primary">
            {Math.round(pct)}
          </span>
        </div>
      </div>
      <span className="text-[7.5px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>

      {/* Tooltip ao passar o mouse (igual aos itens da Activity Bar) */}
      <span
        className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border-default bg-bg-overlay px-2 py-1 text-[11px] font-medium text-text-primary opacity-0 shadow-md transition-opacity group-hover:opacity-100"
        style={{ zIndex: 100 }}
      >
        {tooltip}
      </span>
    </div>
  );
}
