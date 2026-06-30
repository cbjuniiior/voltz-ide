import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Check, Loader2, Download, Upload } from 'lucide-react';
import { useGitStore, selectGit } from '@/stores/git';
import { toast } from '@/stores/toasts';

interface Props {
  projectPath: string;
}

/** Mostra a branch atual + nº de alterações e permite trocar de branch. */
export function GitChip({ projectPath }: Props) {
  const git = useGitStore((s) => selectGit(s.byPath, projectPath));
  const refresh = useGitStore((s) => s.refresh);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Carrega ao montar / trocar de projeto.
  useEffect(() => { void refresh(projectPath); }, [projectPath, refresh]);

  // Checa o GitHub periodicamente (fetch + behind) e avisa se há commits novos.
  useEffect(() => {
    const check = useGitStore.getState().checkRemote;
    void check(projectPath);
    const id = setInterval(() => void check(projectPath), 90_000);
    return () => clearInterval(id);
  }, [projectPath]);

  // Atualiza ao voltar o foco e quando arquivos mudam (debounced).
  useEffect(() => {
    function onFocus() { void refresh(projectPath); }
    window.addEventListener('focus', onFocus);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const offWatch = window.api.files.onWatchEvent(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(projectPath), 900);
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer) clearTimeout(timer);
      offWatch();
    };
  }, [projectPath, refresh]);

  if (!git?.isRepo || !git.branch) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={`Branch: ${git.branch}${git.changes ? ` · ${git.changes} alteração(ões)` : ' · sem alterações'}`}
        className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors hover:border-border-default"
        style={{
          borderColor: open ? 'var(--accent)' : 'var(--border-subtle)',
          background: 'var(--bg-base)',
          color: 'var(--text-tertiary)',
        }}
      >
        <GitBranch size={12} className="shrink-0" />
        <span className="max-w-[120px] truncate">{git.branch}</span>
        {git.changes > 0 && (
          <span
            className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            {git.changes}
          </span>
        )}
        {git.behind > 0 && (
          <span
            title={`${git.behind} commit(s) novo(s) no GitHub — clique para atualizar`}
            className="flex h-4 items-center gap-0.5 rounded-full px-1 text-[9px] font-bold"
            style={{ background: 'color-mix(in srgb, var(--info) 20%, transparent)', color: 'var(--info)' }}
          >
            <Download size={9} />{git.behind}
          </span>
        )}
        {git.ahead > 0 && (
          <span
            title={`${git.ahead} commit(s) local(is) para enviar`}
            className="flex h-4 items-center gap-0.5 rounded-full px-1 text-[9px] font-bold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Upload size={9} />{git.ahead}
          </span>
        )}
      </button>
      {open && btnRef.current && (
        <BranchPicker
          anchor={btnRef.current}
          projectPath={projectPath}
          current={git.branch}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BranchPicker({
  anchor, projectPath, current, onClose,
}: {
  anchor: HTMLElement;
  projectPath: string;
  current: string;
  onClose: () => void;
}) {
  const refresh = useGitStore((s) => s.refresh);
  const pull = useGitStore((s) => s.pull);
  const git = useGitStore((s) => selectGit(s.byPath, projectPath));
  const [syncing, setSyncing] = useState<'pull' | 'push' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doPull() {
    if (syncing) return;
    setSyncing('pull');
    const res = await pull(projectPath);
    setSyncing(null);
    if (res.ok) { toast.success('Atualizado', 'git pull concluído'); onClose(); }
    else toast.error('Falha no pull', res.error);
  }
  async function doPush() {
    if (syncing) return;
    setSyncing('push');
    const res = await window.api.git.push(projectPath);
    await refresh(projectPath);
    setSyncing(null);
    if (res.ok) toast.success('Enviado', 'git push concluído');
    else toast.error('Falha no push', res.error);
  }
  const [branches, setBranches] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const width = 240;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left: Math.max(8, left), top: r.bottom + 4, width });
  }, [anchor]);

  useEffect(() => {
    void window.api.git.branches(projectPath).then(setBranches);
    inputRef.current?.focus();
  }, [projectPath]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  async function switchTo(branch: string) {
    if (branch === current || busy) return;
    setBusy(branch);
    const res = await window.api.git.checkout(projectPath, branch);
    if (res.ok) {
      toast.success('Branch alterada', branch);
      await refresh(projectPath);
      onClose();
    } else {
      toast.error('Não consegui trocar de branch', res.error);
      setBusy(null);
    }
  }

  const filtered = branches.filter((b) => !q || b.toLowerCase().includes(q.toLowerCase()));

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[300] flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-overlay shadow-lg"
      style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: 320 }}
    >
      {git && (git.behind > 0 || git.ahead > 0) && (
        <div className="flex flex-col gap-1.5 border-b border-border-subtle p-2">
          {git.behind > 0 && (
            <button
              onClick={() => void doPull()}
              disabled={!!syncing}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold transition-opacity disabled:opacity-60"
              style={{ background: 'color-mix(in srgb, var(--info) 16%, transparent)', color: 'var(--info)' }}
            >
              {syncing === 'pull' ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <Download size={13} className="shrink-0" />}
              <span className="flex-1">Atualizar — {git.behind} novo{git.behind > 1 ? 's' : ''} no GitHub</span>
            </button>
          )}
          {git.ahead > 0 && (
            <button
              onClick={() => void doPush()}
              disabled={!!syncing}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold transition-opacity disabled:opacity-60"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {syncing === 'push' ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <Upload size={13} className="shrink-0" />}
              <span className="flex-1">Enviar — {git.ahead} commit{git.ahead > 1 ? 's' : ''} local{git.ahead > 1 ? 'is' : ''}</span>
            </button>
          )}
        </div>
      )}
      <div className="border-b border-border-subtle p-2">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Trocar de branch…"
          className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div className="overflow-y-auto py-1">
        {filtered.map((b) => {
          const isCurrent = b === current;
          return (
            <button
              key={b}
              onMouseDown={(e) => { e.preventDefault(); void switchTo(b); }}
              disabled={!!busy}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-hover disabled:opacity-50"
              style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              {busy === b
                ? <Loader2 size={12} className="shrink-0 animate-spin" />
                : <GitBranch size={12} className="shrink-0 opacity-70" />}
              <span className="flex-1 truncate">{b}</span>
              {isCurrent && <Check size={12} className="shrink-0" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2.5 py-3 text-center text-[11px] text-text-muted">Nenhuma branch</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
