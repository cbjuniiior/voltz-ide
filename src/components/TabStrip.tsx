import { useState } from 'react';
import { Plus, X, Loader2, Globe, GitBranch, LayoutGrid, PanelLeft, Radio } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProjectCustomStore, selectCustom, DEFAULT_CUSTOM } from '@/stores/projectCustom';
import { useAttentionStore } from '@/stores/attention';
import { useGitStore, selectGit } from '@/stores/git';
import { useClaudeStatusStore, type ClaudeStatus } from '@/stores/claudeStatus';
import { useDevServersStore } from '@/stores/devServers';
import { collectLeaves } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';
import { TitleColorPopover } from './TitleColorPopover';
import type { PaneNode } from '@shared/types';

/** Status agregado da aba. Prioridade: approval > waiting > running. */
function claudeOfTab(root: PaneNode, byPane: Record<string, ClaudeStatus>): ClaudeStatus | null {
  let running = false, waiting = false;
  for (const l of collectLeaves(root)) {
    const st = byPane[l.id];
    if (st === 'approval') return 'approval';
    if (st === 'waiting') waiting = true;
    if (st === 'running') running = true;
  }
  return waiting ? 'waiting' : running ? 'running' : null;
}

interface Props {
  onNewTab: () => void;
  onLayoutPicker: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onCloseTab: (id: string) => void;
}

export function TabStrip({ onNewTab, onLayoutPicker, onToggleSidebar, sidebarOpen, onCloseTab }: Props) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setTabCustom = useWorkspaceStore((s) => s.setTabCustom);
  const toggleBroadcast = useWorkspaceStore((s) => s.toggleBroadcast);
  const customs = useProjectCustomStore((s) => s.customs);
  const attention = useAttentionStore((s) => s.tabs);
  const clearAttention = useAttentionStore((s) => s.clear);
  const gitByPath = useGitStore((s) => s.byPath);
  const claudeByPane = useClaudeStatusStore((s) => s.byPane);
  const devByPath = useDevServersStore((s) => s.byPath);
  const [editing, setEditing] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const editingTab = editing ? tabs.find((t) => t.id === editing.id) ?? null : null;
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="relative flex h-11 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-surface px-2">
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Ocultar Favoritos' : 'Mostrar Favoritos'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        style={{ color: sidebarOpen ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
      >
        <PanelLeft size={15} />
      </button>
      <div className="mx-0.5 h-5 w-px bg-border-subtle" />

      {/* Abas */}
      <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.length === 0 && (
          <span className="px-2 text-[12px] text-text-muted">Sem abas — abra um projeto nos Favoritos</span>
        )}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const leaves = collectLeaves(tab.root);
          const firstNamed = leaves.find((l) => l.projectPath && l.projectName);
          const c = firstNamed?.projectPath ? selectCustom(customs, firstNamed.projectPath) : DEFAULT_CUSTOM;
          const auto = firstNamed?.projectName ? getProjectColor(firstNamed.projectName) : null;
          const accent = tab.color ?? c.color ?? auto?.border ?? 'var(--accent)';
          const title = tab.customTitle ?? c.alias ?? firstNamed?.projectName ?? tab.title;
          const needsAttention = !!attention[tab.id] && !isActive;
          const git = firstNamed?.projectPath ? selectGit(gitByPath, firstNamed.projectPath) : null;
          const claude = claudeOfTab(tab.root, claudeByPane);
          const dev = firstNamed?.projectPath ? devByPath[firstNamed.projectPath] ?? null : null;
          const devRunning = dev?.phase === 'running';

          return (
            <div
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); clearAttention(tab.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); setEditing({ id: tab.id, anchor: e.currentTarget }); }}
              title="Duplo-clique para renomear e mudar a cor"
              className="group relative flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition-all"
              style={{
                minWidth: 130,
                maxWidth: 200,
                background: needsAttention
                  ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                  : isActive ? `color-mix(in srgb, ${accent} 16%, var(--bg-base))` : 'transparent',
                color: needsAttention || isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: needsAttention
                  ? 'inset 0 0 0 1px color-mix(in srgb, var(--success) 55%, transparent)'
                  : isActive ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 42%, transparent)` : 'none',
              }}
              onMouseEnter={(e) => { if (!isActive && !needsAttention) e.currentTarget.style.background = `color-mix(in srgb, ${accent} 10%, var(--bg-hover))`; }}
              onMouseLeave={(e) => { if (!isActive && !needsAttention) e.currentTarget.style.background = 'transparent'; }}
            >
              {c.emoji ? (
                <span className="text-[13px] leading-none" style={{ opacity: isActive ? 1 : 0.7 }}>{c.emoji}</span>
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent, opacity: isActive ? 1 : 0.6 }} />
              )}
              <span className="flex-1 truncate font-medium">{title}</span>

              {claude === 'running' ? (
                <Loader2 size={11} className="shrink-0 animate-spin text-text-muted" />
              ) : claude === 'approval' ? (
                <span className="claude-dot h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--warning)', boxShadow: '0 0 6px var(--warning)' }} />
              ) : (claude === 'waiting' || needsAttention) ? (
                <span className="claude-dot h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
              ) : null}

              {devRunning && <Globe size={11} className="shrink-0 text-success" />}
              {git && git.changes > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-warning">
                  <GitBranch size={8} /> {git.changes}
                </span>
              )}
              {leaves.length > 1 && (
                <span className="rounded px-1 text-[9px] font-semibold text-text-muted" style={{ background: 'var(--bg-active)' }}>{leaves.length}</span>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                className="flex h-4 w-4 items-center justify-center rounded text-text-muted transition-all hover:bg-bg-active hover:text-text-primary"
                style={{ opacity: isActive ? 0.7 : 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = isActive ? '0.7' : '0'; }}
              >
                <X size={11} />
              </button>
              {!needsAttention && (
                <span aria-hidden className="pointer-events-none absolute inset-x-2.5 -bottom-[5px] h-[2px] rounded-t transition-opacity" style={{ background: accent, opacity: isActive ? 1 : 0.4 }} />
              )}
            </div>
          );
        })}
        <button
          onClick={onNewTab}
          title="Nova aba (Ctrl+T)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Ações à direita */}
      <div className="flex shrink-0 items-center gap-0.5">
        {activeTab && (
          <button
            onClick={() => toggleBroadcast(activeTab.id)}
            title={activeTab.broadcast ? 'Broadcast ligado — digita em todos os terminais da aba' : 'Ligar broadcast (digitar em todos os terminais)'}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-bg-hover"
            style={{ color: activeTab.broadcast ? 'var(--accent)' : 'var(--text-tertiary)' }}
          >
            <Radio size={14} />
          </button>
        )}
        <button
          onClick={onLayoutPicker}
          title="Split Layout (vários terminais)"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <LayoutGrid size={14} />
          <span className="hidden sm:inline">Split</span>
        </button>
      </div>

      {editing && editingTab && (
        <TitleColorPopover
          anchor={editing.anchor}
          initialTitle={editingTab.customTitle ?? ''}
          placeholder={editingTab.title || 'Aba'}
          initialColor={editingTab.color ?? ''}
          onClose={() => setEditing(null)}
          onSave={(title, color) => {
            setTabCustom(editing.id, { customTitle: title.trim() || undefined, color: color || undefined });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
