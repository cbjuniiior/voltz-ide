import { useEffect, useRef, useState } from 'react';
import { X, LayoutGrid } from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { getProjectColor } from '@/lib/projectColors';
import type { Project } from '@shared/types';

export type LayoutId = '1' | 'h2' | 'v2' | 'h3' | 'l1r2' | 'quad' | 'g3' | 'g4' | 'g6';

interface LayoutOption {
  id: LayoutId;
  label: string;
  count: number;
  icon: React.ReactNode;
}

function LayoutIcon({ type }: { type: LayoutId }) {
  const base = 'rounded-sm border border-current';
  const s = { color: 'currentColor' };
  if (type === '1') return (
    <div className="flex h-8 w-10 items-stretch p-0.5">
      <div className={`flex-1 ${base}`} style={s} />
    </div>
  );
  if (type === 'h2') return (
    <div className="flex h-8 w-10 gap-0.5 p-0.5">
      <div className={`flex-1 ${base}`} style={s} />
      <div className={`flex-1 ${base}`} style={s} />
    </div>
  );
  if (type === 'v2') return (
    <div className="flex h-8 w-10 flex-col gap-0.5 p-0.5">
      <div className={`flex-1 ${base}`} style={s} />
      <div className={`flex-1 ${base}`} style={s} />
    </div>
  );
  if (type === 'h3') return (
    <div className="flex h-8 w-12 gap-0.5 p-0.5">
      <div className={`flex-1 ${base}`} style={s} />
      <div className={`flex-1 ${base}`} style={s} />
      <div className={`flex-1 ${base}`} style={s} />
    </div>
  );
  if (type === 'l1r2') return (
    <div className="flex h-8 w-10 gap-0.5 p-0.5">
      <div className={`flex-1 ${base}`} style={s} />
      <div className="flex flex-1 flex-col gap-0.5">
        <div className={`flex-1 ${base}`} style={s} />
        <div className={`flex-1 ${base}`} style={s} />
      </div>
    </div>
  );
  if (type === 'g3' || type === 'g4' || type === 'g6') {
    const n = type === 'g3' ? 3 : type === 'g4' ? 4 : 6;
    return (
      <div className="grid h-8 w-10 p-0.5" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)`, gap: '1.5px' }}>
        {Array.from({ length: n * n }).map((_, i) => <div key={i} className={base} style={s} />)}
      </div>
    );
  }
  // quad
  return (
    <div className="grid h-8 w-10 grid-cols-2 gap-0.5 p-0.5">
      {[0,1,2,3].map(i => <div key={i} className={base} style={s} />)}
    </div>
  );
}

const LAYOUTS: LayoutOption[] = [
  { id: '1',    label: 'Solo',        count: 1, icon: <LayoutIcon type="1" /> },
  { id: 'h2',   label: '2 lado a lado', count: 2, icon: <LayoutIcon type="h2" /> },
  { id: 'v2',   label: '2 empilhados',  count: 2, icon: <LayoutIcon type="v2" /> },
  { id: 'h3',   label: '3 terminais',   count: 3, icon: <LayoutIcon type="h3" /> },
  { id: 'l1r2', label: '1 + 2',         count: 3, icon: <LayoutIcon type="l1r2" /> },
  { id: 'quad', label: '2 × 2',         count: 4, icon: <LayoutIcon type="quad" /> },
  { id: 'g3',   label: '3 × 3',         count: 9, icon: <LayoutIcon type="g3" /> },
  { id: 'g4',   label: '4 × 4',         count: 16, icon: <LayoutIcon type="g4" /> },
  { id: 'g6',   label: '6 × 6',         count: 36, icon: <LayoutIcon type="g6" /> },
];

interface Props {
  onClose: () => void;
  onCreate: (layoutId: LayoutId, slots: { name: string; path: string }[]) => void;
}

export function LayoutPickerModal({ onClose, onCreate }: Props) {
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const [layout, setLayout] = useState<LayoutId>('h2');
  const [slots, setSlots] = useState<(Project | null)[]>([null, null]);
  const [searches, setSearches] = useState<string[]>(['', '']);

  const currentLayout = LAYOUTS.find(l => l.id === layout)!;

  useEffect(() => {
    const count = currentLayout.count;
    setSlots(prev => {
      if (prev.length === count) return prev;
      if (prev.length < count) return [...prev, ...Array(count - prev.length).fill(null)];
      return prev.slice(0, count);
    });
    setSearches(prev => {
      if (prev.length === count) return prev;
      if (prev.length < count) return [...prev, ...Array(count - prev.length).fill('')];
      return prev.slice(0, count);
    });
  }, [layout, currentLayout.count]);

  function pickProject(slotIdx: number, project: Project | null) {
    setSlots(prev => prev.map((s, i) => i === slotIdx ? project : s));
    setSearches(prev => prev.map((s, i) => i === slotIdx ? (project ? '' : s) : s));
  }

  function handleCreate() {
    const filled = slots.map((p, i) => {
      const c = p ? customs[p.path] : null;
      return {
        name: c?.alias || p?.name || `Terminal ${i + 1}`,
        path: p?.path || '',
      };
    });
    onCreate(layout, filled);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-full max-w-2xl flex-col gap-5 overflow-auto rounded-xl border border-border-default bg-bg-surface p-6 shadow-lg"
        style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg p-1.5" style={{ background: 'var(--accent-soft)' }}>
              <LayoutGrid size={16} className="text-accent" />
            </div>
            <span className="text-base font-bold tracking-tight text-text-primary">Novo Layout de Terminais</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary">
            <X size={14} />
          </button>
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">
            Layout
          </p>
          <div className="flex flex-wrap gap-2">
            {LAYOUTS.map(l => {
              const active = l.id === layout;
              return (
                <button
                  key={l.id}
                  onClick={() => setLayout(l.id)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-xs font-semibold transition-all"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border-default)',
                    background: active ? 'var(--accent-soft)' : 'var(--bg-base)',
                    color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}
                >
                  <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{l.icon}</span>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {currentLayout.count <= 6 ? (
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">
              Projetos por terminal
            </p>
            <div className="flex flex-wrap gap-3">
              {slots.map((selected, idx) => (
                <SlotPicker
                  key={idx}
                  label={`Terminal ${idx + 1}`}
                  projects={projects}
                  customs={customs}
                  selected={selected}
                  search={searches[idx]}
                  onSearch={(v) => setSearches(prev => prev.map((s, i) => i === idx ? v : s))}
                  onSelect={(p) => pickProject(idx, p)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-[11.5px] leading-relaxed text-text-tertiary">
            Grade grande — <span className="font-semibold text-text-secondary">{currentLayout.count} painéis</span>. Os terminais começam vazios; escolha o conteúdo (Terminal / Navegador) em cada painel depois de criar.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <button onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">
            Cancelar
          </button>
          <button onClick={handleCreate}
            className="rounded-lg px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            ▶ Criar Layout
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotPicker({ label, projects, customs, selected, search, onSearch, onSelect }: {
  label: string;
  projects: Project[];
  customs: Record<string, { alias?: string; emoji?: string; color?: string; favorite: boolean }>;
  selected: Project | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (p: Project | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const filtered = projects.filter(p => {
    if (!search) return true;
    const name = customs[p.path]?.alias || p.name;
    return name.toLowerCase().includes(search.toLowerCase());
  }).slice(0, 10);

  const displayName = selected
    ? (customs[selected.path]?.alias || selected.name)
    : 'Escolher projeto...';

  return (
    <div className="relative flex-1" style={{ minWidth: 160 }}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <button
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-bg-base px-2.5 py-2 text-left text-xs transition-colors hover:border-accent"
      >
        {selected ? (
          <>
            <ProjectBadge project={selected} customs={customs} />
            <span className="flex-1 truncate" style={{ color: getProjectColor(selected.name).text }}>
              {displayName}
            </span>
            <span className="text-text-muted hover:text-text-primary"
              onClick={(e) => { e.stopPropagation(); onSelect(null); }}>×</span>
          </>
        ) : (
          <span className="text-text-muted">{displayName}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="p-1.5">
            <input
              ref={inputRef}
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-40 overflow-y-auto pb-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); onSearch(''); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-muted hover:bg-bg-hover"
            >
              Deixar vazio
            </button>
            {filtered.map(p => {
              const c = customs[p.path];
              const name = c?.alias || p.name;
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false); onSearch(''); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-hover"
                >
                  <ProjectBadge project={p} customs={customs} />
                  <span className="truncate" style={{ color: getProjectColor(p.name).text }}>
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectBadge({ project, customs }: {
  project: Project;
  customs: Record<string, { alias?: string; emoji?: string; color?: string; favorite: boolean }>;
}) {
  const c = selectCustom(customs, project.path);
  const color = getProjectColor(project.name);
  const badgeBg = (c.color ?? color.badge) + '33';
  const borderColor = c.color ?? color.border;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs"
      style={{ background: badgeBg, border: `1px solid ${borderColor}40` }}>
      {c.emoji || project.name[0].toUpperCase()}
    </span>
  );
}
