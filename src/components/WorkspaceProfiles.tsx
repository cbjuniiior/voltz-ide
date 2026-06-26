import { useEffect, useRef, useState } from 'react';
import { Bookmark, Save, RotateCcw, Pencil, Trash2, Layers } from 'lucide-react';
import { useWorkspaceProfilesStore } from '@/stores/workspaceProfiles';
import { toast } from '@/stores/toasts';

export function WorkspaceProfiles() {
  const profiles = useWorkspaceProfilesStore((s) => s.profiles);
  const saveCurrent = useWorkspaceProfilesStore((s) => s.saveCurrent);
  const update = useWorkspaceProfilesStore((s) => s.update);
  const rename = useWorkspaceProfilesStore((s) => s.rename);
  const remove = useWorkspaceProfilesStore((s) => s.remove);
  const apply = useWorkspaceProfilesStore((s) => s.apply);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function save() {
    if (!name.trim()) return;
    saveCurrent(name);
    toast.success('Perfil salvo', name.trim());
    setName('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Perfis de workspace"
        className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        style={{ background: open ? 'var(--bg-active)' : undefined }}
      >
        <Bookmark size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="px-3 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Salvar abas atuais
          </div>
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="Nome do perfil…"
              className="flex-1 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent"
            />
            <button
              onClick={save}
              disabled={!name.trim()}
              title="Salvar"
              className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Save size={12} />
            </button>
          </div>

          <div className="border-t border-border-subtle" />
          <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Perfis salvos
          </div>
          <div className="max-h-72 overflow-y-auto pb-1.5">
            {profiles.length === 0 && (
              <div className="px-3 py-3 text-center text-[11px] text-text-muted">Nenhum perfil salvo</div>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="group flex items-center gap-1 px-1.5 py-0.5">
                <button
                  onClick={() => { apply(p.id); toast.info('Workspace carregado', p.name); setOpen(false); }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bg-hover"
                  title={`Carregar "${p.name}"`}
                >
                  <Layers size={13} className="shrink-0 text-text-tertiary" />
                  <span className="flex-1 truncate text-[12px] text-text-secondary">{p.name}</span>
                  <span className="shrink-0 text-[10px] text-text-muted">{p.tabs.length} aba{p.tabs.length === 1 ? '' : 's'}</span>
                </button>
                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn title="Atualizar com as abas atuais" onClick={() => { update(p.id); toast.success('Perfil atualizado', p.name); }}>
                    <RotateCcw size={12} />
                  </IconBtn>
                  <IconBtn title="Renomear" onClick={() => {
                    const v = window.prompt('Novo nome do perfil:', p.name);
                    if (v && v.trim()) rename(p.id, v);
                  }}>
                    <Pencil size={12} />
                  </IconBtn>
                  <IconBtn title="Excluir" danger onClick={() => {
                    if (window.confirm(`Excluir o perfil "${p.name}"?`)) remove(p.id);
                  }}>
                    <Trash2 size={12} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children, onClick, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active"
      onMouseEnter={(e) => { e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {children}
    </button>
  );
}
