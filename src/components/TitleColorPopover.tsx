import { useEffect, useRef, useState } from 'react';
import { RotateCcw as ResetIcon } from 'lucide-react';
import { PROJECT_PALETTE } from '@/lib/projectColors';

/**
 * Popover compacto para renomear + escolher cor — usado no duplo-clique do
 * título do terminal (PaneHeader) e das abas (WorkspaceHeader). Ancora-se a um
 * elemento (o título clicado) e fecha ao clicar fora ou apertar Esc.
 */
export function TitleColorPopover({
  anchor, initialTitle, placeholder, initialColor, onClose, onSave,
}: {
  anchor: HTMLElement;
  initialTitle: string;
  placeholder: string;
  initialColor: string;
  onClose: () => void;
  onSave: (title: string, color: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState(initialColor);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const popW = 240;
    const left = Math.min(r.left, window.innerWidth - popW - 8);
    setPos({ top: r.bottom + 6, left: Math.max(8, left) });
  }, [anchor]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[200] flex flex-col gap-3 rounded-xl border border-border-default bg-bg-overlay p-3.5 shadow-lg"
      style={{ top: pos.top, left: pos.left, width: 240 }}
    >
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Nome
        </label>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(title, color); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Cor</label>
          {color && (
            <button
              onClick={() => setColor('')}
              className="flex items-center gap-1 text-[10px] text-text-muted transition-colors hover:text-text-primary"
              title="Usar cor automática"
            >
              <ResetIcon size={10} /> auto
            </button>
          )}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {PROJECT_PALETTE.map((p) => {
            const selected = color === p.border;
            return (
              <button
                key={p.id}
                onClick={() => setColor(selected ? '' : p.border)}
                className="flex h-7 items-center justify-center rounded-lg transition-transform hover:scale-[1.08]"
                style={{
                  background: selected ? p.border : p.bg,
                  border: `1px solid ${selected ? p.border : p.border + '55'}`,
                }}
                title={p.label}
              >
                {selected && <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.bg }} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-2.5">
        <button
          onClick={onClose}
          className="rounded-lg px-2.5 py-1.5 text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(title, color)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
