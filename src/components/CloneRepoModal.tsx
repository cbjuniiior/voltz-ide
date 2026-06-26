import { useEffect, useMemo, useRef, useState } from 'react';
import { Github, Lock, Globe, Search, FolderDown, Loader2, X, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useProjectsStore } from '@/stores/projects';
import { useWorkspaceStore } from '@/stores/workspace';
import { toast } from '@/stores/toasts';
import type { GithubRepo } from '@shared/types';

type State = 'loading' | 'ready' | 'noauth' | 'error';

function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)} mês`;
  return `${Math.floor(d / 365)} ano`;
}

/** Modal para clonar um repositório do GitHub da conta conectada no computador. */
export function CloneRepoModal({ onClose }: { onClose: () => void }) {
  const rootFolders = useSettingsStore((s) => s.settings.rootFolders);
  const update = useSettingsStore((s) => s.update);
  const scan = useProjectsStore((s) => s.scan);
  const openProjectInNewTab = useWorkspaceStore((s) => s.openProjectInNewTab);

  const [state, setState] = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GithubRepo | null>(null);
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null);

  async function load() {
    setState('loading');
    const [status, list] = await Promise.all([
      window.api.github.status().catch(() => ({ authenticated: false as const })),
      window.api.github.listRepos().catch((e) => ({ ok: false as const, error: String(e) })),
    ]);
    setLogin(status.authenticated ? status.login ?? null : null);
    if (!list.ok) {
      if (!status.authenticated) { setState('noauth'); return; }
      setErrorMsg(list.error); setState('error'); return;
    }
    setRepos(list.repos);
    setState('ready');
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !cloning) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, cloning]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q));
  }, [repos, query]);

  async function startClone(repo: GithubRepo) {
    const parent = await window.api.dialog.pickFolder();
    if (!parent) return;
    setCloning(true);
    setProgress({ phase: 'Preparando', percent: 0 });
    const off = window.api.github.onCloneProgress((p) => setProgress(p));
    try {
      const res = await window.api.github.clone(repo.cloneUrl, parent, repo.name);
      if (!res.ok) { toast.error('Falha ao clonar', res.error); return; }
      // Garante que a pasta-mãe esteja nas raízes (para o repo aparecer na lista).
      if (!rootFolders.includes(parent)) {
        const next = [...rootFolders, parent];
        await update({ rootFolders: next });
        await scan(next);
      } else {
        await scan(rootFolders);
      }
      toast.success('Repositório clonado', repo.fullName);
      openProjectInNewTab(repo.name, res.path);
      onClose();
    } catch (e) {
      toast.error('Falha ao clonar', String((e as Error)?.message ?? e));
    } finally {
      off();
      setCloning(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/50 p-6 pt-[12vh] backdrop-blur-sm"
      onMouseDown={() => { if (!cloning) onClose(); }}
    >
      <div
        className="flex max-h-[72vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <Github size={15} className="text-accent" />
          <span className="text-[13px] font-bold text-text-primary">Clonar do GitHub</span>
          {login && <span className="rounded px-1.5 text-[10px] font-medium text-text-muted" style={{ background: 'var(--bg-active)' }}>@{login}</span>}
          <button
            onClick={() => void load()}
            title="Recarregar"
            className="ml-auto rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { if (!cloning) onClose(); }} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary" title="Fechar">
            <X size={14} />
          </button>
        </div>

        {/* Busca */}
        {state === 'ready' && (
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <Search size={13} className="text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar repositórios…"
              className="flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <span className="text-[10px] text-text-muted">{filtered.length}</span>
          </div>
        )}

        {/* Corpo */}
        <div className="min-h-[160px] flex-1 overflow-y-auto p-2">
          {state === 'loading' && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-muted">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-[12px]">Carregando seus repositórios…</span>
            </div>
          )}

          {state === 'noauth' && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
              <Github size={22} className="text-text-muted" />
              <span className="text-[12.5px] font-medium text-text-secondary">Nenhuma conta GitHub conectada neste computador</span>
              <span className="text-[11px] leading-relaxed text-text-muted">
                Faça login no GitHub pelo git (ex.: <span className="font-mono text-text-tertiary">gh auth login</span> ou um clone/push autenticado) e recarregue.
              </span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="text-[12.5px] font-medium text-danger">Não foi possível listar os repositórios</span>
              <span className="text-[11px] text-text-muted">{errorMsg}</span>
            </div>
          )}

          {state === 'ready' && filtered.map((r) => {
            const isSel = selected?.fullName === r.fullName;
            return (
              <button
                key={r.fullName}
                onClick={() => setSelected(r)}
                onDoubleClick={() => { setSelected(r); void startClone(r); }}
                disabled={cloning}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-50"
                style={{ background: isSel ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span className="mt-0.5 shrink-0 text-text-muted">
                  {r.private ? <Lock size={13} /> : <Globe size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-text-primary">{r.fullName}</span>
                    {ago(r.updatedAt) && <span className="shrink-0 text-[10px] text-text-muted">· {ago(r.updatedAt)}</span>}
                  </span>
                  {r.description && <span className="block truncate text-[11px] text-text-tertiary">{r.description}</span>}
                </span>
              </button>
            );
          })}

          {state === 'ready' && filtered.length === 0 && (
            <div className="flex h-32 items-center justify-center text-[12px] text-text-muted">Nenhum repositório encontrado.</div>
          )}
        </div>

        {/* Rodapé / ação */}
        {state === 'ready' && (
          <div className="border-t border-border-subtle px-3 py-2.5">
            {cloning ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[11.5px] text-text-secondary">
                  <Loader2 size={13} className="animate-spin text-accent" />
                  <span>{progress ? `${progress.phase}… ${progress.percent}%` : 'Clonando…'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-active)' }}>
                  <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress?.percent ?? 0}%`, background: 'var(--accent)' }} />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-tertiary">
                  {selected ? <>Clonar <span className="font-medium text-text-secondary">{selected.fullName}</span></> : 'Selecione um repositório'}
                </span>
                <button
                  onClick={() => selected && void startClone(selected)}
                  disabled={!selected}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  <FolderDown size={13} /> Escolher pasta e clonar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
