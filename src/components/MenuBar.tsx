import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Zap, Plus, FolderOpen, X, Settings, Command, Sparkles, Bot, RotateCw,
  PanelLeft, PanelRight, ListChecks, Users, Sun, Moon, Monitor, LogOut, Info,
  Eraser, Minimize2, BarChart3, FolderGit2, Radio, Server,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProvidersStore } from '@/stores/providers';
import { useTasksStore, countPendingToday } from '@/stores/tasks';
import { useDevServersStore } from '@/stores/devServers';
import { emptyLeaf, collectLeaves } from '@/lib/layoutTree';
import { SystemGraph } from './SystemGraph';
import { WorkspaceProfiles } from './WorkspaceProfiles';
import { AiProvidersModal } from './AiProvidersModal';
import type { ThemeMode, PaneLeaf } from '@shared/types';

/** Um item de menu suspenso. `sep` desenha um divisor. */
type MenuItem =
  | { type: 'item'; label: string; shortcut?: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; checked?: boolean }
  | { type: 'sep' };

interface MenuDef {
  id: string;
  label: string;
  accent?: boolean; // destaque (menu "IA")
  items: MenuItem[];
}

export interface MenuBarProps {
  onNewTab: () => void;
  onNewClaudeTerminal: () => void;
  onResumeClaude: () => void;
  onOpenFolder: () => void;
  onCloseTab: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onOpenAccounts: () => void;
  onOpenSessions: () => void;
  onOpenTasksPip: () => void;
  onOpenTasks: () => void;
  onOpenAnalytics: () => void;
  onOpenWorktrees: () => void;
  onOpenBroadcast: () => void;
  onOpenServers: () => void;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
}

export function MenuBar(props: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const theme = useSettingsStore((s) => s.settings.theme);
  const updateSettings = useSettingsStore((s) => s.update);
  const newTab = useWorkspaceStore((s) => s.newTab);
  const splitToTabsFn = useWorkspaceStore((s) => s.splitToTabs);
  const providers = useProvidersStore((s) => s.providers);
  const pendingTasks = useTasksStore((s) => countPendingToday(s.tasks));
  const devRunning = useDevServersStore((s) => Object.values(s.byPath).filter((d) => d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing').length);
  const [providersModalOpen, setProvidersModalOpen] = useState(false);

  const setTheme = (t: ThemeMode) => { void updateSettings({ theme: t }); };

  function activePaneRef(): { tabId: string; paneId: string; terminalId: string | null } | null {
    const ws = useWorkspaceStore.getState();
    const tabId = ws.activeTabId;
    if (!tabId) return null;
    const tab = ws.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    const leaves = collectLeaves(tab.root);
    const paneId = ws.activePaneByTab[tabId] ?? leaves[0]?.id;
    const pane = leaves.find((l) => l.id === paneId) ?? leaves[0];
    if (!pane) return null;
    return { tabId, paneId: pane.id, terminalId: pane.terminalId };
  }
  function clearActive() {
    const a = activePaneRef();
    if (a?.terminalId) window.api.pty.write(a.terminalId, '\x0c'); // Ctrl+L
  }
  function splitToTabs() {
    const a = activePaneRef();
    if (a) splitToTabsFn(a.tabId);
  }

  function startProvider(p: { label: string; command: string }) {
    setOpen(null);
    const isClaude = p.command.trim() === 'claude';
    const leaf: PaneLeaf = isClaude
      ? { ...emptyLeaf(), viewMode: 'terminal', title: p.label, autoStartClaude: true }
      : { ...emptyLeaf(), viewMode: 'terminal', title: p.label, autoRunCommand: p.command };
    newTab(p.label, leaf);
  }

  // Fecha ao apertar Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const run = (fn: () => void) => () => { setOpen(null); fn(); };

  const menus: MenuDef[] = [
    {
      id: 'arquivo',
      label: 'Arquivo',
      items: [
        { type: 'item', label: 'Nova aba', shortcut: 'Ctrl+T', icon: <Plus size={14} />, onClick: run(props.onNewTab) },
        { type: 'item', label: 'Abrir pasta…', icon: <FolderOpen size={14} />, onClick: run(props.onOpenFolder) },
        { type: 'sep' },
        { type: 'item', label: 'Fechar aba', shortcut: 'Ctrl+W', icon: <X size={14} />, onClick: run(props.onCloseTab) },
        { type: 'sep' },
        { type: 'item', label: 'Configurações…', shortcut: 'Ctrl+,', icon: <Settings size={14} />, onClick: run(props.onOpenSettings) },
        { type: 'item', label: 'Sair', icon: <LogOut size={14} />, danger: true, onClick: run(() => window.close()) },
      ],
    },
    {
      id: 'ia',
      label: 'IA',
      accent: true,
      items: [
        { type: 'item', label: 'Novo terminal com Claude', shortcut: 'Ctrl+T', icon: <Sparkles size={14} />, onClick: run(props.onNewClaudeTerminal) },
        { type: 'item', label: 'Retomar última sessão', icon: <RotateCw size={14} />, onClick: run(props.onResumeClaude) },
        { type: 'item', label: 'Histórico de sessões…', icon: <Bot size={14} />, onClick: run(props.onOpenSessions) },
        { type: 'sep' },
        { type: 'item', label: 'Contas Claude…', icon: <Users size={14} />, onClick: run(props.onOpenAccounts) },
        { type: 'item', label: 'Worktrees (agentes isolados)…', icon: <FolderGit2 size={14} />, onClick: run(props.onOpenWorktrees) },
        { type: 'item', label: 'Broadcast de comando…', shortcut: 'Ctrl+Shift+B', icon: <Radio size={14} />, onClick: run(props.onOpenBroadcast) },
        { type: 'sep' },
        { type: 'item', label: 'Buscar tudo (Command Palette)', shortcut: 'Ctrl+K', icon: <Command size={14} />, onClick: run(props.onOpenPalette) },
      ],
    },
    {
      id: 'ver',
      label: 'Ver',
      items: [
        { type: 'item', label: props.sidebarOpen ? 'Ocultar Favoritos' : 'Mostrar Favoritos', shortcut: 'Ctrl+B', icon: <PanelLeft size={14} />, onClick: run(props.onToggleSidebar) },
        { type: 'item', label: props.inspectorOpen ? 'Ocultar Inspetor' : 'Mostrar Inspetor', icon: <PanelRight size={14} />, onClick: run(props.onToggleInspector) },
        { type: 'sep' },
        { type: 'item', label: 'Tema do sistema', icon: <Monitor size={14} />, checked: theme === 'system', onClick: run(() => setTheme('system')) },
        { type: 'item', label: 'Tema claro', icon: <Sun size={14} />, checked: theme === 'light', onClick: run(() => setTheme('light')) },
        { type: 'item', label: 'Tema escuro', icon: <Moon size={14} />, checked: theme === 'dark', onClick: run(() => setTheme('dark')) },
        { type: 'sep' },
        { type: 'item', label: 'Recarregar', icon: <RotateCw size={14} />, onClick: run(() => window.location.reload()) },
      ],
    },
    {
      id: 'janela',
      label: 'Janela',
      items: [
        { type: 'item', label: 'Tarefas flutuantes', icon: <ListChecks size={14} />, onClick: run(props.onOpenTasksPip) },
      ],
    },
    {
      id: 'ajuda',
      label: 'Ajuda',
      items: [
        { type: 'item', label: 'Sobre o Voltz IDE', icon: <Info size={14} />, onClick: run(() => alert('Voltz IDE — Multiterminal para Claude Code & Codex.\nFeito por Cassio Bona.')) },
      ],
    },
  ];

  return (
    <div
      ref={barRef}
      className="relative z-50 flex h-9 shrink-0 items-center gap-0.5 border-b border-border-subtle bg-bg-surface px-2 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Identidade do app */}
      <div className="mr-2 flex items-center gap-1.5 pl-1 pr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
          <Zap size={12} className="text-white" fill="currentColor" />
        </span>
        <span className="text-[12.5px] font-bold tracking-tight text-text-primary">Voltz IDE</span>
      </div>

      {/* Menus */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {menus.map((m) => (
          <div key={m.id} className="relative">
            <button
              onClick={() => setOpen((cur) => (cur === m.id ? null : m.id))}
              onMouseEnter={() => { if (open) setOpen(m.id); }}
              className="flex h-7 items-center gap-1 rounded-md px-2.5 text-[12.5px] transition-colors"
              style={{
                background: open === m.id ? 'var(--bg-active)' : 'transparent',
                color: m.accent ? 'var(--accent-hover)' : (open === m.id ? 'var(--text-primary)' : 'var(--text-tertiary)'),
                fontWeight: m.accent ? 600 : 500,
              }}
              onMouseOver={(e) => { if (open !== m.id) e.currentTarget.style.color = m.accent ? 'var(--accent-hover)' : 'var(--text-secondary)'; }}
              onMouseOut={(e) => { if (open !== m.id) e.currentTarget.style.color = m.accent ? 'var(--accent-hover)' : 'var(--text-tertiary)'; }}
            >
              {m.accent && <Sparkles size={12} />}
              {m.label}
            </button>
            {open === m.id && <Dropdown items={m.items} />}
          </div>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={clearActive}
          title="Limpar o terminal ativo (Ctrl+L)"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Eraser size={13} /> Limpar
        </button>
        <button
          onClick={splitToTabs}
          title="Desfazer o split — manda cada painel para uma aba própria (não fecha nada)"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Minimize2 size={13} /> Split → abas
        </button>
        <button
          onClick={props.onOpenTasks}
          title="Tarefas — gerenciador de produtividade"
          className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <ListChecks size={14} /> Tarefas
          {pendingTasks > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>{pendingTasks}</span>
          )}
        </button>
        <button
          onClick={props.onOpenServers}
          title="Dev servers — ver e parar/iniciar os que estão rodando"
          className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Server size={14} /> Servers
          {devRunning > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums" style={{ background: 'var(--success)', color: '#fff' }}>{devRunning}</span>
          )}
        </button>
        <div className="h-5 w-px bg-border-subtle" />
        <SystemGraph />
        <div className="h-5 w-px bg-border-subtle" />
        {providers.filter((p) => p.enabled).map((p) => (
          <button
            key={p.id}
            onClick={() => startProvider(p)}
            title={`Novo terminal com ${p.label} (${p.command})`}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setProvidersModalOpen(true)}
          title="Configurar providers de IA"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Plus size={14} />
        </button>
        <div className="h-5 w-px bg-border-subtle" />
        <button
          onClick={props.onOpenPalette}
          title="Buscar tudo (Ctrl+K)"
          className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base px-2.5 text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary"
        >
          <Command size={12} />
          <span className="text-[11px]">Buscar</span>
          <kbd className="rounded bg-bg-active px-1 py-0.5 font-mono text-[9px] text-text-muted">Ctrl K</kbd>
        </button>
        <button
          onClick={props.onOpenAnalytics}
          title="Painel de produtividade (Analytics)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <BarChart3 size={14} />
        </button>
        <WorkspaceProfiles />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Alternar tema"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
        </button>
      </div>

      {/* Camada de captura para fechar ao clicar fora */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => setOpen(null)}
          onContextMenu={(e) => { e.preventDefault(); setOpen(null); }}
        />
      )}
      <AiProvidersModal open={providersModalOpen} onClose={() => setProvidersModalOpen(false)} />
    </div>
  );
}

function Dropdown({ items }: { items: MenuItem[] }) {
  return (
    <div
      className="cmd-enter absolute left-0 top-[calc(100%+4px)] z-50 min-w-[230px] overflow-hidden rounded-lg border border-border-default bg-bg-overlay py-1 shadow-lg"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {items.map((it, i) =>
        it.type === 'sep' ? (
          <div key={i} className="my-1 h-px bg-border-subtle" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={it.onClick}
            className="group flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors disabled:opacity-40"
            style={{ color: it.danger ? 'var(--danger)' : 'var(--text-secondary)' }}
            onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="flex w-4 shrink-0 items-center justify-center" style={{ color: it.danger ? 'var(--danger)' : 'var(--text-tertiary)' }}>
              {it.checked ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} /> : it.icon}
            </span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && (
              <kbd className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-muted">{it.shortcut}</kbd>
            )}
          </button>
        ),
      )}
    </div>
  );
}
