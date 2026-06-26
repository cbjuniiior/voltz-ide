import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitBranch, GitCommit, Plus, Minus, RefreshCw, ArrowUp, ArrowDown,
  FileText, Loader2, Check, Sparkles,
} from 'lucide-react';
import type { GitFileStatus } from '@shared/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useGitStore } from '@/stores/git';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { useEditorStore } from '@/stores/editor';
import { collectLeaves } from '@/lib/layoutTree';
import { toast } from '@/stores/toasts';
import { PanelHeader } from './ui';

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

const EMPTY: GitStatus = { isRepo: false, branch: null, ahead: 0, behind: 0, files: [] };

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}
function dirname(p: string): string {
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

/** Letra + cor para um código de status do git. */
function statusInfo(code: string): { letter: string; color: string } {
  switch (code) {
    case 'M': return { letter: 'M', color: 'var(--warning)' };
    case 'A': return { letter: 'A', color: 'var(--success)' };
    case 'D': return { letter: 'D', color: 'var(--danger)' };
    case 'R': return { letter: 'R', color: 'var(--info)' };
    case 'C': return { letter: 'C', color: 'var(--info)' };
    case '?': return { letter: 'U', color: 'var(--text-muted)' };
    default: return { letter: code.trim() || '•', color: 'var(--text-muted)' };
  }
}

export function GitPane() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const refreshChip = useGitStore((s) => s.refresh);
  const openFile = useEditorStore((s) => s.openFile);

  const projectPath = useMemo(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return null;
    return collectLeaves(tab.root).find((l) => l.projectPath)?.projectPath ?? null;
  }, [tabs, activeTabId]);

  const [status, setStatus] = useState<GitStatus>(EMPTY);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectPath) { setStatus(EMPTY); return; }
    const st = await window.api.git.status(projectPath);
    setStatus(st);
    void refreshChip(projectPath);
  }, [projectPath, refreshChip]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Atualiza ao focar a janela e quando arquivos mudam (debounced).
  useEffect(() => {
    function onFocus() { void refresh(); }
    window.addEventListener('focus', onFocus);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = window.api.files.onWatchEvent(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 800);
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer) clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const staged = status.files.filter((f) => f.index !== ' ' && f.index !== '?');
  const changes = status.files.filter((f) => f.work !== ' ');

  async function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    if (busy || !projectPath) return;
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) toast.error(label, res.error);
      await refresh();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!projectPath || !message.trim() || staged.length === 0) return;
    const ok = await run('Falha no commit', () => window.api.git.commit(projectPath, message));
    if (ok) { setMessage(''); toast.success('Commit criado', `${staged.length} arquivo(s)`); }
  }

  // Gera a mensagem de commit com o Claude a partir do diff do que está no stage.
  async function generateMessage() {
    if (!projectPath || generating || staged.length === 0) return;
    setGenerating(true);
    try {
      const diff = await window.api.git.diff(projectPath, true);
      if (!diff.trim()) { toast.warning('Nada no stage', 'Adicione arquivos ao stage primeiro.'); return; }
      const configDir = useAccountsStore.getState().dirFor(undefined) || undefined;
      const res = await window.api.claude.commitMessage({ diff, cwd: projectPath, configDir });
      if (res.ok) { setMessage(res.message); toast.success('Mensagem gerada', 'Revise e ajuste se quiser.'); }
      else toast.error('Não consegui gerar a mensagem', res.error);
    } finally {
      setGenerating(false);
    }
  }

  async function push() {
    const ok = await run('Falha no push', () => window.api.git.push(projectPath!));
    if (ok) toast.success('Push concluído', status.branch ?? '');
  }
  async function pull() {
    const ok = await run('Falha no pull', () => window.api.git.pull(projectPath!));
    if (ok) toast.success('Pull concluído', status.branch ?? '');
  }

  function open(p: string) {
    if (projectPath && activeTabId) void openFile(activeTabId, projectPath, p);
  }

  if (!projectPath) {
    return (
      <PaneShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <GitBranch size={22} className="text-text-disabled" />
          <p className="text-[12px] text-text-tertiary">Abra um projeto numa aba</p>
        </div>
      </PaneShell>
    );
  }

  if (!status.isRepo) {
    return (
      <PaneShell branch={null} onRefresh={refresh} busy={busy}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <GitBranch size={22} className="text-text-disabled" />
          <p className="text-[12px] text-text-tertiary">Esta pasta não é um repositório git</p>
        </div>
      </PaneShell>
    );
  }

  const nothing = staged.length === 0 && changes.length === 0;

  return (
    <PaneShell branch={status.branch} ahead={status.ahead} behind={status.behind} onRefresh={refresh} busy={busy}>
      <div className="flex-1 overflow-y-auto">
        {nothing && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <Check size={20} className="text-success" />
            <p className="text-[12px] text-text-tertiary">Árvore de trabalho limpa</p>
          </div>
        )}

        {staged.length > 0 && (
          <Group
            title={`Staged · ${staged.length}`}
            actionLabel="Unstage all"
            onAction={() => run('Falha ao remover do stage', () => window.api.git.unstage(projectPath, staged.map((f) => f.path)))}
          >
            {staged.map((f) => (
              <FileRow
                key={`s-${f.path}`} file={f} code={f.index} staged
                onOpen={() => open(f.path)}
                onToggle={() => run('Falha ao remover do stage', () => window.api.git.unstage(projectPath, [f.path]))}
              />
            ))}
          </Group>
        )}

        {changes.length > 0 && (
          <Group
            title={`Alterações · ${changes.length}`}
            actionLabel="Stage all"
            onAction={() => run('Falha ao adicionar ao stage', () => window.api.git.stage(projectPath, changes.map((f) => f.path)))}
          >
            {changes.map((f) => (
              <FileRow
                key={`c-${f.path}`} file={f} code={f.index === '?' ? '?' : f.work}
                onOpen={() => open(f.path)}
                onToggle={() => run('Falha ao adicionar ao stage', () => window.api.git.stage(projectPath, [f.path]))}
              />
            ))}
          </Group>
        )}
      </div>

      {/* Commit + remoto */}
      <div className="shrink-0 border-t border-border-subtle p-2.5">
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); }}
            placeholder="Mensagem do commit…  (Ctrl+Enter)"
            rows={2}
            className="w-full resize-none rounded-lg border border-border-subtle bg-bg-base py-2 pl-2.5 pr-[88px] text-[12px] text-text-primary outline-none transition-colors focus:border-accent"
          />
          {staged.length > 0 && (
            <button
              onClick={generateMessage}
              disabled={generating}
              title="Gerar a mensagem de commit com o Claude (a partir do que está no stage)"
              className="absolute right-1.5 top-1.5 flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-bold transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} IA
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={commit}
            disabled={busy || !message.trim() || staged.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <GitCommit size={13} /> Commit{staged.length > 0 ? ` (${staged.length})` : ''}
          </button>
          <button
            onClick={pull}
            disabled={busy}
            title="git pull"
            className="flex h-8 items-center gap-1 rounded-lg border border-border-subtle px-2 text-[11px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            <ArrowDown size={13} />{status.behind > 0 ? status.behind : ''}
          </button>
          <button
            onClick={push}
            disabled={busy}
            title="git push"
            className="flex h-8 items-center gap-1 rounded-lg border border-border-subtle px-2 text-[11px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            <ArrowUp size={13} />{status.ahead > 0 ? status.ahead : ''}
          </button>
        </div>
      </div>
    </PaneShell>
  );
}

function PaneShell({
  children, branch, ahead = 0, behind = 0, onRefresh, busy,
}: {
  children: React.ReactNode;
  branch?: string | null;
  ahead?: number;
  behind?: number;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<GitBranch size={14} />}
        title="Git"
        subtitle={branch ? (
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-text-tertiary">{branch}</span>
            {ahead > 0 && <span>↑{ahead}</span>}
            {behind > 0 && <span>↓{behind}</span>}
          </span>
        ) : undefined}
        actions={onRefresh ? (
          <button
            onClick={onRefresh}
            title="Atualizar"
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        ) : undefined}
      />
      {children}
    </div>
  );
}

function Group({
  title, actionLabel, onAction, children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{title}</span>
        <button
          onClick={onAction}
          className="text-[10px] text-text-muted transition-colors hover:text-accent"
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function FileRow({
  file, code, staged = false, onOpen, onToggle,
}: {
  file: GitFileStatus;
  code: string;
  staged?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const info = statusInfo(code);
  const dir = dirname(file.path);
  return (
    <div className="group flex items-center gap-2 px-3 py-1 transition-colors hover:bg-bg-hover">
      <FileText size={12} className="shrink-0 text-text-muted" />
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left" title={file.path}>
        <span className="truncate text-[12px] text-text-secondary">{basename(file.path)}</span>
        {dir && <span className="truncate text-[10px] text-text-muted">{dir}</span>}
      </button>
      <span className="shrink-0 text-[10px] font-bold" style={{ color: info.color }}>{info.letter}</span>
      <button
        onClick={onToggle}
        title={staged ? 'Remover do stage' : 'Adicionar ao stage'}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:bg-bg-active hover:text-text-primary group-hover:opacity-100"
      >
        {staged ? <Minus size={13} /> : <Plus size={13} />}
      </button>
    </div>
  );
}
