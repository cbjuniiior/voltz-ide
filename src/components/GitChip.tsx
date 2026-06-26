import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Check, Loader2 } from 'lucide-react';
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
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
