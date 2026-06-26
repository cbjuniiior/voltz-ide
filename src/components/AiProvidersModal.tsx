import { useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw, Sparkles } from 'lucide-react';
import { useProvidersStore } from '@/stores/providers';

const SWATCHES = ['#d97757', '#10a37f', '#4587f4', '#7c6bff', '#e0a64e', '#3ed598', '#ff5d5d', '#4aa3ff', '#c061ff', '#5b6478'];

export function AiProvidersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const providers = useProvidersStore((s) => s.providers);
  const add = useProvidersStore((s) => s.add);
  const update = useProvidersStore((s) => s.update);
  const remove = useProvidersStore((s) => s.remove);
  const reset = useProvidersStore((s) => s.reset);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="cmd-enter flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-overlay shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
            <Sparkles size={16} className="text-accent" />
          </span>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-text-primary">AI Providers</h2>
            <p className="text-[11.5px] text-text-muted">Configure as CLIs de IA exibidas na toolbar.</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {providers.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-base p-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={p.enabled} onChange={(e) => void update(p.id, { enabled: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                  <input value={p.label} onChange={(e) => void update(p.id, { label: e.target.value })} placeholder="Nome" className="w-36 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary outline-none focus:border-accent" />
                  <input value={p.command} onChange={(e) => void update(p.id, { command: e.target.value })} placeholder="comando (ex.: claude)" className="flex-1 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1.5 font-mono text-[12px] text-text-secondary outline-none focus:border-accent" />
                  <button onClick={() => void remove(p.id)} title="Remover" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pl-6">
                  <span className="text-[10.5px] text-text-muted">Cor:</span>
                  {SWATCHES.map((c) => (
                    <button key={c} onClick={() => void update(p.id, { color: c })} className="h-4 w-4 rounded-full transition-transform hover:scale-110" style={{ background: c, boxShadow: p.color === c ? `0 0 0 2px var(--bg-base), 0 0 0 4px ${c}` : 'none' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
          <button onClick={() => void add()} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Plus size={14} /> Adicionar Provider
          </button>
          <button onClick={() => void reset()} className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-default">
            <RotateCcw size={13} /> Resetar para padrão
          </button>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-2 text-[12.5px] font-medium text-text-tertiary transition-colors hover:text-text-secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
