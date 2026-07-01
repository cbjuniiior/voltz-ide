import { useEffect, useRef, useState } from 'react';
import type { PaneLeaf, CanvasRect } from '@shared/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useClaudeStatusStore } from '@/stores/claudeStatus';
import { PERSONAS, MAESTRO_ID } from '@/lib/personaCatalog';
import { squadSlotCenter } from '@/lib/squadLayout';
import { Play } from 'lucide-react';

/**
 * Overlay do Canvas do Esquadrão (renderizado DENTRO do mundo transformado do
 * WorkspaceCanvas). Desenha as conexões Maestro→personas e, para as personas
 * ainda NÃO abertas, mostra "bolinhas" aguardando. Ativar (clique OU o Maestro
 * delegando) abre o terminal da persona no lugar — economiza RAM/CPU.
 */
export function SquadOverlay({ tabId, leaves, rectOf }: {
  tabId: string;
  leaves: PaneLeaf[];
  rectOf: (id: string) => CanvasRect;
}) {
  const activate = useWorkspaceStore((s) => s.activateSquadPersona);
  const claudeByPane = useClaudeStatusStore((s) => s.byPane);

  const activePersona: Record<string, PaneLeaf> = {};
  for (const l of leaves) if (l.personaId) activePersona[l.personaId] = l;
  const maestroTid = activePersona[MAESTRO_ID]?.terminalId ?? null;

  // Pulso curto quando o Maestro cita a persona (antes de abrir).
  const [pulse, setPulse] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    if (!maestroTid) return;
    const off = window.api.pty.onData((id, data) => {
      if (id !== maestroTid) return;
      for (const p of PERSONAS) {
        if (p.id === MAESTRO_ID) continue;
        if (data.includes(p.id)) {
          setPulse((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: true }));
          clearTimeout(timers.current[p.id]);
          timers.current[p.id] = setTimeout(() => setPulse((prev) => { const n = { ...prev }; delete n[p.id]; return n; }), 2500);
          activate(tabId, p.id); // recebeu ordem → abre o terminal
        }
      }
    });
    return off;
  }, [maestroTid, tabId, activate]);

  function center(personaId: string): { x: number; y: number } {
    const leaf = activePersona[personaId];
    if (leaf) { const r = rectOf(leaf.id); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
    return squadSlotCenter(personaId);
  }
  const mc = center(MAESTRO_ID);
  const specialists = PERSONAS.filter((p) => p.id !== MAESTRO_ID);

  return (
    <>
      <style>{`@keyframes voltzFlow2 { to { stroke-dashoffset:-28 } }`}</style>

      {/* Conexões Maestro → personas */}
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1 }}>
        {specialists.map((p) => {
          const c = center(p.id);
          const leaf = activePersona[p.id];
          const working = leaf ? claudeByPane[leaf.id] === 'running' : false;
          const flowing = working || !!pulse[p.id];
          const on = !!leaf || !!pulse[p.id];
          return (
            <line
              key={p.id}
              x1={mc.x} y1={mc.y} x2={c.x} y2={c.y}
              stroke={p.color}
              strokeWidth={on ? 2.2 : 1.4}
              strokeOpacity={on ? 0.8 : 0.2}
              strokeLinecap="round"
              strokeDasharray={flowing ? '5 7' : undefined}
              style={flowing ? { animation: 'voltzFlow2 0.9s linear infinite' } : undefined}
            />
          );
        })}
      </svg>

      {/* Personas aguardando (bolinhas) */}
      {specialists.filter((p) => !activePersona[p.id]).map((p) => {
        const c = squadSlotCenter(p.id);
        const NW = 158, NH = 62;
        const pulsing = !!pulse[p.id];
        return (
          <button
            key={p.id}
            data-canvas-card
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => activate(tabId, p.id)}
            title={`${p.name} — ${p.role} · clique para abrir o terminal`}
            className="group absolute z-10 flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all duration-200 hover:scale-[1.06]"
            style={{
              left: c.x - NW / 2, top: c.y - NH / 2, width: NW, minHeight: NH,
              background: pulsing ? `color-mix(in srgb, ${p.color} 26%, var(--bg-overlay))` : 'var(--bg-surface)',
              borderColor: pulsing ? p.color : `color-mix(in srgb, ${p.color} 40%, var(--border-subtle))`,
              boxShadow: pulsing ? `0 0 0 1px ${p.color}, 0 8px 26px -8px ${p.color}` : '0 6px 16px -10px rgba(0,0,0,0.6)',
            }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[17px]" style={{ background: `color-mix(in srgb, ${p.color} 24%, transparent)` }}>{p.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-bold text-text-primary">{p.name}</span>
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-disabled)' }} /> aguardando
              </span>
            </span>
            <Play size={12} className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        );
      })}
    </>
  );
}
