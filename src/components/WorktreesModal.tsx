import { useEffect, useState, useCallback } from 'react';
import { X, GitBranch, Plus, Trash2, TerminalSquare, FolderGit2, Loader2 } from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { openProjectFromTask } from '@/lib/openProject';
import { toast } from '@/stores/toasts';

interface Worktree { path: string; branch: string | null }

/**
 * Gerenciador de git worktrees: rode agentes isolados em branches paralelas do
 * MESMO repositório, sem que um pise no checkout do outro. Usa os handlers
 * git:worktreeList / worktreeAdd / worktreeRemove já existentes no backend.
 */
export function WorktreesModal({ onClose, defaultRepo }: {
  onClose: () => void;
  defaultRepo?: { name: string; path: string } | null;
}) {
  const projects = useProjectsStore((s) => s.projects);
  const [repo, setRepo] = useState<{ name: string; path: string } | null>(
    defaultRepo ?? (projects[0] ? { name: projects[0].name, path: projects[0].path } : null),
  );
  const [list, setList] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!repo) { setList([]); return; }
    setLoading(true);
    try {
      const wts = await window.api.git.worktreeList(repo.path);
      setList(wts);
    } catch { setList([]); }
    setLoading(false);
  }, [repo]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function create() {
    if (!repo || !newName.trim()) return;
    setCreating(true);
    const res = await window.api.git.worktreeAdd(repo.path, newName.trim());
    setCreating(false);
    if (res.ok) {
      toast.success('Worktree criado', res.branch);
      setNewName('');
      void refresh();
    } else {
      toast.error('Falha ao criar worktree', res.error);
    }
  }

  async function remove(wtPath: string) {
    if (!repo) return;
    if (!window.confirm('Remover este worktree? A branch em si permanece no repositório.')) return;
    const res = await window.api.git.worktreeRemove(repo.path, wtPath);
    if (res.ok) { toast.success('Worktree removido'); void refresh(); }
    else toast.error('Falha ao remover', res.error);
  }

  function openTerminal(wt: Worktree) {
    if (!repo) return;
    openProjectFromTask(wt.branch ? `${repo.name} · ${wt.branch}` : repo.name, wt.path);
    onClose();
  }

  const mainPath = repo?.path;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-6 pt-[8vh]" onClick={onClose}>
      <div
        className="cmd-enter flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <FolderGit2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-bold text-text-primary">Worktrees</h2>
            <p className="truncate text-[11px] text-text-muted">Agentes isolados em branches paralelas do mesmo repo</p>
          </div>
          <button onClick={onClose} title="Fechar (Esc)" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={15} />
          </button>
        </div>

        {/* Seletor de repositório */}
        <div className="border-b border-border-subtle px-4 py-2.5">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-muted">Repositório</label>
          <select
            value={repo?.path ?? ''}
            onChange={(e) => {
              const p = projects.find((x) => x.path === e.target.value);
              setRepo(p ? { name: p.name, path: p.path } : null);
            }}
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent"
          >
            {projects.length === 0 && <option value="">Nenhum projeto</option>}
            {projects.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
          </select>
        </div>

        {/* Criar worktree */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-2.5 transition-colors focus-within:border-accent">
            <GitBranch size={13} className="text-text-muted" />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/\s+/g, '-'))}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
              placeholder="nova-branch (cria worktree isolado)"
              className="flex-1 bg-transparent py-1.5 text-[12px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <button
            onClick={() => void create()}
            disabled={!newName.trim() || creating || !repo}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />} Criar
          </button>
        </div>

        {/* Lista de worktrees */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          )}
          {!loading && list.length === 0 && (
            <div className="py-10 text-center text-[12px] text-text-muted">
              {repo ? 'Nenhum worktree neste repositório.' : 'Selecione um repositório.'}
            </div>
          )}
          {!loading && list.map((wt) => {
            const isMain = wt.path === mainPath;
            return (
              <div key={wt.path} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-bg-surface">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                  <GitBranch size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-text-primary">{wt.branch ?? '(sem branch)'}</span>
                    {isMain && <span className="shrink-0 rounded-full bg-bg-active px-1.5 py-px text-[9px] font-bold text-text-muted">principal</span>}
                  </div>
                  <span className="block truncate text-[10.5px] text-text-muted" title={wt.path}>{wt.path}</span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openTerminal(wt)} title="Abrir terminal neste worktree" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary">
                    <TerminalSquare size={14} />
                  </button>
                  {!isMain && (
                    <button onClick={() => void remove(wt.path)} title="Remover worktree" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
