import { useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace';
import type { SplitPosition } from '@/lib/layoutTree';

type Zone = 'left' | 'right' | 'top' | 'bottom';

/**
 * Envolve um painel (terminal/vídeo) e aceita o drop de um projeto arrastado da
 * sidebar: a borda mais próxima do cursor define onde abrir o terminal do projeto
 * (esquerda/direita = colunas; cima/baixo = linhas).
 */
export function PaneDropZone({ tabId, paneId, children }: { tabId: string; paneId: string; children: React.ReactNode }) {
  const draggingProject = useWorkspaceStore((s) => s.draggingProject);
  const splitWithProject = useWorkspaceStore((s) => s.splitWithProject);
  const setDraggingProject = useWorkspaceStore((s) => s.setDraggingProject);
  const ref = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<Zone | null>(null);

  function calcZone(e: React.DragEvent): Zone {
    const r = ref.current!.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
    const min = Math.min(d.left, d.right, d.top, d.bottom);
    return min === d.left ? 'left' : min === d.right ? 'right' : min === d.top ? 'top' : 'bottom';
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      {children}
      {draggingProject && (
        <div
          className="absolute inset-0 z-30"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/voltz-project')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setZone(calcZone(e));
          }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setZone(null); }}
          onDrop={(e) => {
            e.preventDefault();
            const z = calcZone(e);
            let proj: { path: string; name: string } | null = draggingProject;
            const raw = e.dataTransfer.getData('application/voltz-project');
            if (raw) { try { proj = JSON.parse(raw); } catch { /* ignore */ } }
            if (proj) {
              const orientation: 'horizontal' | 'vertical' = z === 'left' || z === 'right' ? 'vertical' : 'horizontal';
              const position: SplitPosition = z === 'left' || z === 'top' ? 'before' : 'after';
              splitWithProject(tabId, paneId, orientation, position, proj.name, proj.path);
            }
            setZone(null);
            setDraggingProject(null);
          }}
        >
          {zone && <Highlight zone={zone} label={draggingProject.name} />}
        </div>
      )}
    </div>
  );
}

function Highlight({ zone, label }: { zone: Zone; label: string }) {
  const pos: React.CSSProperties =
    zone === 'left' ? { left: 0, top: 0, width: '50%', height: '100%' }
      : zone === 'right' ? { right: 0, top: 0, width: '50%', height: '100%' }
        : zone === 'top' ? { left: 0, top: 0, width: '100%', height: '50%' }
          : { left: 0, bottom: 0, width: '100%', height: '50%' };
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        ...pos,
        background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
        boxShadow: 'inset 0 0 0 2px var(--accent)',
        transition: 'left 120ms ease-out, right 120ms ease-out, top 120ms ease-out, width 120ms ease-out, height 120ms ease-out',
      }}
    >
      <span className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white shadow-lg" style={{ background: 'var(--accent)' }}>
        Abrir {label} aqui
      </span>
    </div>
  );
}
