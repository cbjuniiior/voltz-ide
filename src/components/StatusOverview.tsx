import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Sparkles, Loader2, Globe, GitBranch, Folder } from 'lucide-react';
import type { PaneNode, Tab } from '@shared/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useClaudeStatusStore, type ClaudeStatus } from '@/stores/claudeStatus';
import { useDevServersStore } from '@/stores/devServers';
import { useGitStore, selectGit } from '@/stores/git';
import { useAttentionStore } from '@/stores/attention';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { collectLeaves } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';

function claudeOfTab(root: PaneNode, byPane: Record<string, ClaudeStatus>): ClaudeStatus | null {
  let running = false;
  for (const l of collectLeaves(root)) {
    const st = byPane[l.id];
    if (st === 'waiting') return 'waiting';
    if (st === 'running') running = true;
  }
  return running ? 'running' : null;
}

export function StatusOverview() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const byPane = useClaudeStatusStore((s) => s.byPane);
  const devServers = useDevServersStore((s) => s.byPath);
  const gitByPath = useGitStore((s) => s.byPath);
  const customs = useProjectCustomStore((s) => s.customs);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const rows = useMemo(() => tabs.map((tab: Tab) => {
    const leaves = collectLeaves(tab.root);
    const named = leaves.find((l) => l.projectPath && l.projectName);
    const projectPath = named?.projectPath ?? null;
    const custom = projectPath ? selectCustom(customs, projectPath) : null;
    const auto = named?.projectName ? getProjectColor(named.projectName) : null;
    return {
      id: tab.id,
      title: tab.customTitle ?? named?.projectName ?? tab.title,
      color: tab.color ?? custom?.color ?? auto?.border ?? 'var(--accent)',
      emoji: custom?.emoji,
      claude: claudeOfTab(tab.root, byPane),
      dev: projectPath ? devServers[projectPath] ?? null : null,
      git: selectGit(gitByPath, projectPath),
    };
  }), [tabs, byPane, devServers, gitByPath, customs]);

  const waitingCount = rows.filter((r) => r.claude === 'waiting').length;

  function go(id: string) {
    setActiveTab(id);
    useAttentionStore.getState().clear(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Visão geral (status de todos os projetos)"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        style={{ background: open ? 'var(--bg-active)' : undefined }}
      >
        <LayoutDashboard size={14} />
        {waitingCount > 0 && (
          <span
            className="claude-dot absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ background: 'var(--success)', color: 'var(--accent-fg)' }}
          >
            {waitingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Visão geral</span>
            {waitingCount > 0 && (
              <span className="text-[10px] font-semibold text-success">{waitingCount} aguardando você</span>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto pb-1.5">
            {rows.length === 0 && (
              <div className="px-3 py-6 text-center text-[11px] text-text-muted">Nenhuma aba aberta</div>
            )}
            {rows.map((r) => {
              const isActive = r.id === activeTabId;
              const devRunning = r.dev?.phase === 'running';
              const devBusy = r.dev?.phase === 'installing' || r.dev?.phase === 'starting';
              return (
                <button
                  key={r.id}
                  onClick={() => go(r.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                  style={{ background: isActive ? 'var(--bg-active)' : undefined }}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]" style={{ color: r.color }}>
                    {r.emoji ? <span>{r.emoji}</span> : <Folder size={13} />}
                  </span>
                  <span className="flex-1 truncate text-[12px] font-medium text-text-secondary">{r.title}</span>

                  {/* Claude */}
                  {r.claude === 'waiting' && (
                    <span className="claude-dot flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                      <Sparkles size={9} /> aguarda
                    </span>
                  )}
                  {r.claude === 'running' && (
                    <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                      <Loader2 size={9} className="animate-spin" /> roda
                    </span>
                  )}

                  {/* Dev server */}
                  {devRunning && (
                    <span title={r.dev?.url ?? 'dev rodando'} className="shrink-0">
                      <Globe size={12} className="text-success" />
                    </span>
                  )}
                  {devBusy && <Loader2 size={12} className="shrink-0 animate-spin text-warning" />}

                  {/* Git */}
                  {r.git && r.git.changes > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-warning" title={`${r.git.changes} alterações`}>
                      <GitBranch size={10} /> {r.git.changes}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
