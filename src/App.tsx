import { useEffect, useState, useRef } from 'react';
import { Sparkles, Globe, GitBranch, ListChecks, FolderOpen, Command, X, Terminal as TerminalIcon } from 'lucide-react';
import { FavoritesSidebar } from './components/FavoritesSidebar';
import { MarkdownViewer } from './components/MarkdownViewer';
import { CloneRepoModal } from './components/CloneRepoModal';
import { TasksModal } from './components/TasksModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { WorktreesModal } from './components/WorktreesModal';
import { BroadcastModal } from './components/BroadcastModal';
import { TabStrip } from './components/TabStrip';
import { MenuBar } from './components/MenuBar';
import { Workspace } from './components/Workspace';
import { SessionsPane } from './components/SessionsPane';
import { AccountsPane } from './components/AccountsPane';
import { GitPane } from './components/GitPane';
import { ServersPane } from './components/ServersPane';
import { SkillsPane } from './components/SkillsPane';
import { SquadPane } from './components/SquadPane';
import { PaneErrorBoundary } from './components/PaneErrorBoundary';
import { TasksView, TasksPipPlaceholder } from './components/TasksPane';
import { QuickOpenModal } from './components/QuickOpenModal';
import { SearchModal } from './components/SearchModal';
import { QuickTaskModal } from './components/QuickTaskModal';
import { TerminalSwitcher, type SwitchItem } from './components/TerminalSwitcher';
import { SettingsModal } from './components/SettingsModal';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/ToastContainer';
import { UpdateBanner } from './components/UpdateBanner';
import { LayoutPickerModal, type LayoutId } from './components/LayoutPickerModal';
import { useSettingsStore } from './stores/settings';
import { useWorkspaceStore } from './stores/workspace';
import { useProjectsStore } from './stores/projects';
import { useEditorStore } from './stores/editor';
import { useTasksStore, todayKey } from './stores/tasks';
import { useAttentionStore } from './stores/attention';
import { useWorkspaceProfilesStore } from './stores/workspaceProfiles';
import { useAccountsStore } from './stores/claudeAccounts';
import { useAppUsageStore, startAppUsageTracking } from './stores/appUsage';
import { useGitStore } from './stores/git';
import { useClaudeStatusStore, type ClaudeStatus } from './stores/claudeStatus';
import { ensureNotifyPermission, notifySystem } from './lib/notify';
import { usePomodoroStore } from './stores/pomodoro';
import { useProjectCustomStore } from './stores/projectCustom';
import { useDevServersStore } from './stores/devServers';
import { useUpdateStore } from './stores/update';
import { useRemoteStore } from './stores/remote';
import { useProcMonitorStore } from './stores/procMonitor';
import { useSnippetsStore } from './stores/snippets';
import { useProvidersStore } from './stores/providers';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { collectLeaves, emptyLeaf } from './lib/layoutTree';
import type { PaneNode, PaneLeaf } from '@shared/types';

type DrawerKind = 'sessions' | 'accounts' | 'git' | 'servers' | 'skills' | 'tasks' | 'squad';

/** Dispara o fim de cada fase do Pomodoro (beep + notificação). */
function usePomodoroDriver() {
  useEffect(() => {
    const id = setInterval(() => {
      const s = usePomodoroStore.getState();
      if (s.running && s.endsAt && Date.now() >= s.endsAt) {
        const wasFocus = s.phase === 'focus';
        s.complete();
        notifySystem(
          wasFocus ? 'Pomodoro · hora da pausa ☕' : 'Pomodoro · hora de focar 🍅',
          wasFocus ? 'Sessão de foco concluída.' : 'Pausa encerrada.',
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
}

export function App() {
  usePomodoroDriver();
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadCustoms = useProjectCustomStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);

  const wsLoaded = useWorkspaceStore((s) => s.loaded);
  const loadWorkspace = useWorkspaceStore((s) => s.load);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const rawCloseTab = useWorkspaceStore((s) => s.closeTab);
  const closeTab = (tabId: string) => {
    const editor = useEditorStore.getState();
    if (editor.hasAnyDirty(tabId)) {
      const ok = window.confirm('Essa aba tem arquivos não salvos. Fechar mesmo assim?');
      if (!ok) return;
    }
    editor.closeAllForTab(tabId);
    rawCloseTab(tabId);
  };
  const newTab = useWorkspaceStore((s) => s.newTab);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const newTabWithLayout = useWorkspaceStore((s) => s.newTabWithLayout);

  const scan = useProjectsStore((s) => s.scan);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem('voltz:sidebarWidth'));
    return Number.isFinite(stored) && stored >= 220 ? Math.min(stored, 460) : 264;
  });
  useEffect(() => { localStorage.setItem('voltz:sidebarWidth', String(sidebarWidth)); }, [sidebarWidth]);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const [claudePath, setClaudePath] = useState<string | null>(null);
  const [tasksPipOpen, setTasksPipOpen] = useState(false);
  const [mdFile, setMdFile] = useState<{ root: string; path: string; name: string } | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [worktreesOpen, setWorktreesOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [switcher, setSwitcher] = useState<{ items: SwitchItem[]; idx: number; query: string } | null>(null);
  const switcherRef = useRef<{ items: SwitchItem[]; idx: number; query: string } | null>(null);
  switcherRef.current = switcher;
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);

  function openTasksPip() { void window.api.pip.openTasks(); setTasksPipOpen(true); }
  function closeTasksPip() { void window.api.pip.closeTasks(); setTasksPipOpen(false); }

  // ===== Ações da barra de menu =====
  function openFolder() {
    void window.api.dialog.pickFolder().then((p) => {
      if (!p) return;
      const name = p.split(/[\\/]/).filter(Boolean).pop() || p;
      useWorkspaceStore.getState().openProjectInNewTab(name, p);
    });
  }
  function newClaudeTerminal() {
    const leaf: PaneLeaf = { ...emptyLeaf(), viewMode: 'terminal', title: 'Claude', autoStartClaude: true };
    newTab('Claude', leaf);
  }
  function resumeLastClaude() {
    void window.api.claude.allSessions(1).then((list) => {
      const s = list?.[0];
      if (s?.cwd) useWorkspaceStore.getState().openProjectAndResume(s.projectName, s.cwd, s.id);
      else setDrawer('sessions');
    });
  }
  function closeActiveTab() { if (activeTabId) closeTab(activeTabId); }

  useEffect(() => window.api.pip.onClosed(() => setTasksPipOpen(false)), []);
  useEffect(() => {
    function onFocus() {
      const id = useWorkspaceStore.getState().activeTabId;
      if (id) useAttentionStore.getState().clear(id);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  useEffect(() => window.api.pip.onOpenProject((name, path) => {
    useWorkspaceStore.getState().openProjectInNewTab(name, path);
  }), []);

  useEffect(() => {
    void loadSettings();
    void loadWorkspace();
    void loadCustoms();
    void useEditorStore.getState().load();
    void useTasksStore.getState().load();
    void useWorkspaceProfilesStore.getState().load();
    void useAccountsStore.getState().load();
    void useAppUsageStore.getState().load();
    void useSnippetsStore.getState().load();
    void useProvidersStore.getState().load();
    useUpdateStore.getState().init();
    useRemoteStore.getState().init();
    ensureNotifyPermission();
    const unbind = useDevServersStore.getState().bind();
    const unbindProc = useProcMonitorStore.getState().bind();
    const offWatch = window.api.files.onWatchEvent((evt) => {
      if (evt.event === 'change' || evt.event === 'unlink') {
        useEditorStore.getState().noteExternalChange(evt.path);
      }
    });
    return () => { unbind(); unbindProc(); offWatch(); };
  }, [loadSettings, loadWorkspace, loadCustoms]);

  useEffect(() => startAppUsageTracking(), []);

  useEffect(() => {
    if (!settingsLoaded) return;
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [settingsLoaded, settings.theme]);

  const initialOpenRef = useRef(false);
  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings.rootFolders.length === 0 && !initialOpenRef.current) {
      setSettingsOpen(true);
      initialOpenRef.current = true;
    }
    if (!settings.claudePath) {
      void window.api.claude.detect().then((r) => {
        if (r.path) { setClaudePath(r.path); void useSettingsStore.getState().update({ claudePath: r.path }); }
      });
    } else {
      setClaudePath(settings.claudePath);
    }
    void scan(settings.rootFolders);
  }, [settingsLoaded, settings.rootFolders, settings.claudePath, scan]);

  // Atalhos via Electron main-process (before-input-event).
  useEffect(() => {
    const off = window.api.shortcuts.onInvoke((action) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      switch (action) {
        case 'palette:toggle': setPaletteOpen((v) => !v); break;
        case 'quickopen:toggle': setQuickOpen((v) => !v); break;
        case 'search:toggle': setSearchOpen((v) => !v); break;
        case 'task:quickAdd': setQuickTaskOpen(true); break;
        case 'workspace:newTab': newTab('Novo'); break;
        case 'settings:open': setSettingsOpen(true); break;
        case 'workspace:splitVertical':
          if (tab) { const id = findFirstLeafId(tab.root); if (id) splitPane(tab.id, id, 'vertical'); }
          break;
        case 'workspace:splitHorizontal':
          if (tab) { const id = findFirstLeafId(tab.root); if (id) splitPane(tab.id, id, 'horizontal'); }
          break;
        default:
          if (action.startsWith('goToTab:')) {
            const n = Number(action.slice('goToTab:'.length));
            const target = tabs[n];
            if (target) setActiveTab(target.id);
          }
          break;
      }
    });
    return off;
  }, [tabs, activeTabId, newTab, splitPane, setActiveTab]);

  // Ctrl+Tab: switcher entre terminais.
  function buildSwitchItems(): SwitchItem[] {
    const byPane = useClaudeStatusStore.getState().byPane;
    return useWorkspaceStore.getState().tabs.flatMap((t) =>
      collectLeaves(t.root)
        .filter((l) => l.projectPath || l.projectName || l.terminalId)
        .map((l) => ({
          tabId: t.id, paneId: l.id,
          title: l.customTitle || l.projectName || l.title || 'Terminal',
          project: l.projectPath ?? null, status: byPane[l.id],
        })),
    );
  }
  function filterSwitch(items: SwitchItem[], query: string): SwitchItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.title.toLowerCase().includes(q) || (it.project ?? '').toLowerCase().includes(q));
  }
  function pickSwitch(i: number) { setSwitcher((s) => (s ? { ...s, idx: i } : s)); }
  function commitSwitch() {
    const s = switcherRef.current;
    if (!s) return;
    const it = filterSwitch(s.items, s.query)[s.idx];
    if (it) { setActiveTab(it.tabId); setActivePane(it.tabId, it.paneId); }
    setSwitcher(null);
  }
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Failsafe: se o switcher ficou aberto mas o Ctrl/Meta já NÃO está mais
      // pressionado (ex.: a janela perdeu o foco antes do keyup do Ctrl), fecha e
      // deixa a tecla seguir normal — senão ele bloquearia a digitação no app todo.
      if (switcherRef.current && !e.ctrlKey && !e.metaKey && e.key !== 'Enter' && e.key !== 'Escape') {
        setSwitcher(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        setSwitcher((s) => {
          if (!s) {
            const items = buildSwitchItems();
            if (items.length <= 1) return null;
            return { items, query: '', idx: e.shiftKey ? items.length - 1 : 1 };
          }
          const n = Math.max(1, filterSwitch(s.items, s.query).length);
          return { ...s, idx: (s.idx + (e.shiftKey ? -1 : 1) + n) % n };
        });
      } else if (switcherRef.current && e.key === 'Escape') {
        e.preventDefault(); setSwitcher(null);
      } else if (switcherRef.current && e.key === 'Enter') {
        e.preventDefault(); commitSwitch();
      } else if (switcherRef.current && e.key === 'Backspace') {
        e.preventDefault();
        setSwitcher((s) => (s ? { ...s, query: s.query.slice(0, -1), idx: 0 } : s));
      } else if (switcherRef.current && (e.ctrlKey || e.metaKey) && e.key.length === 1 && /[a-zA-Z0-9 ._/-]/.test(e.key)) {
        // Filtra por digitação ENQUANTO o Ctrl/Meta está segurado (caso do Ctrl+Tab).
        // O guard de Ctrl/Meta garante que letras normais NUNCA são engolidas.
        e.preventDefault();
        setSwitcher((s) => (s ? { ...s, query: s.query + e.key, idx: 0 } : s));
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if ((e.key === 'Control' || e.key === 'Meta') && switcherRef.current) commitSwitch();
    }
    // Perder o foco da janela (Alt+Tab) sempre fecha o switcher — evita prender.
    function onBlur() { if (switcherRef.current) setSwitcher(null); }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback de atalhos a nível de janela (cobre HMR).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); setPaletteOpen((v) => !v); return; }
      if (ctrl && !e.shiftKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); e.stopPropagation(); setQuickOpen((v) => !v); return; }
      if (ctrl && e.shiftKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); e.stopPropagation(); setPaletteOpen((v) => !v); return; }
      if (ctrl && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); e.stopPropagation(); setSearchOpen((v) => !v); return; }
      if (ctrl && e.shiftKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); e.stopPropagation(); setQuickTaskOpen(true); return; }
      if (ctrl && e.shiftKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); e.stopPropagation(); setBroadcastOpen((v) => !v); return; }
      if (ctrl && e.shiftKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); e.stopPropagation(); useWorkspaceStore.getState().reopenLastClosedTab(); return; }
      if (ctrl && !e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); e.stopPropagation(); setSidebarOpen(true); return; }
      if (ctrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const target = useWorkspaceStore.getState().tabs[Number(e.key) - 1];
        if (target) { e.preventDefault(); useWorkspaceStore.getState().setActiveTab(target.id); }
        return;
      }
      if (ctrl && e.key === 'w' && activeTabId) {
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return;
        e.preventDefault();
        const id = findFirstLeafId(tab.root);
        if (id) closePane(tab.id, id);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tabs, activeTabId, closePane]);

  // Bloqueia drop de arquivo fora das zonas (senão o Electron navega p/ file://).
  useEffect(() => {
    const prevent = (e: DragEvent) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
  }, []);

  if (!settingsLoaded || !wsLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-xs text-text-muted">Carregando…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg flex h-full w-full flex-col text-text-primary">
      <MenuBar
        onNewTab={() => newTab('Novo')}
        onNewClaudeTerminal={newClaudeTerminal}
        onResumeClaude={resumeLastClaude}
        onOpenFolder={openFolder}
        onCloseTab={closeActiveTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleInspector={() => setDrawer((d) => (d ? null : 'git'))}
        onOpenAccounts={() => setDrawer('accounts')}
        onOpenSessions={() => setDrawer('sessions')}
        onOpenTasksPip={openTasksPip}
        onOpenTasks={() => setTasksModalOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onOpenWorktrees={() => setWorktreesOpen(true)}
        onOpenBroadcast={() => setBroadcastOpen(true)}
        onOpenServers={() => setDrawer('servers')}
        onOpenSquad={() => setDrawer('squad')}
        sidebarOpen={sidebarOpen}
        inspectorOpen={drawer !== null}
      />

      <TabStrip
        onNewTab={() => newTab('Novo')}
        onLayoutPicker={() => setLayoutPickerOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
        onCloseTab={closeTab}
      />

      <div className="flex min-h-0 flex-1">
        {/* FAVORITOS */}
        {sidebarOpen && (
          <>
            <aside className="flex h-full shrink-0 flex-col border-r border-border-subtle" style={{ width: sidebarWidth }}>
              <FavoritesSidebar
                onOpenFile={(root, path, name) => setMdFile({ root, path, name })}
                onCloneRepo={() => setCloneOpen(true)}
              />
            </aside>
            <SidebarResizer width={sidebarWidth} onChange={setSidebarWidth} />
          </>
        )}

        {/* Área de painéis */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex-1 overflow-hidden">
            {tabs.length === 0 && (
              <EmptyWorkspace onAddFolder={openFolder} onNewClaude={newClaudeTerminal} onOpenPalette={() => setPaletteOpen(true)} />
            )}
            {tabs.map((t) => {
              const isActive = t.id === activeTabId;
              // Abas inativas COM navegador usam opacity:0 (não visibility:hidden):
              // assim o <webview> SEGUE RENDERIZANDO em background e o Claude
              // consegue ver/capturar a página enquanto você trabalha noutra aba.
              // Abas só de terminal mantêm visibility:hidden (mais leve).
              const hasBrowser = !isActive && collectLeaves(t.root).some((l) => l.viewMode === 'browser');
              return (
                <div
                  key={t.id}
                  className="absolute inset-0"
                  style={{
                    visibility: isActive || hasBrowser ? 'visible' : 'hidden',
                    opacity: isActive ? 1 : 0,
                    pointerEvents: isActive ? 'auto' : 'none',
                    zIndex: isActive ? 1 : 0,
                  }}
                  aria-hidden={!isActive}
                >
                  <Workspace tab={t} />
                </div>
              );
            })}
          </div>
          <StatusBar claudePath={claudePath} shell={settings.defaultShell} onActivateTasks={() => setDrawer('tasks')} onOpenDrawer={setDrawer} />
        </main>

        {/* Drawer lateral (Sessões / Contas / Git / etc.) */}
        {drawer && (
          <RightDrawer
            kind={drawer}
            onClose={() => setDrawer(null)}
            tasksPipOpen={tasksPipOpen}
            onTogglePip={openTasksPip}
            onReturnPip={closeTasksPip}
          />
        )}
      </div>

      {quickOpen && (() => {
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return null;
        const leaf = collectLeaves(tab.root).find((l) => l.projectPath);
        if (!leaf?.projectPath) return null;
        return <QuickOpenModal workspaceTabId={tab.id} projectRoot={leaf.projectPath} onClose={() => setQuickOpen(false)} />;
      })()}

      {searchOpen && (() => {
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return null;
        const leaf = collectLeaves(tab.root).find((l) => l.projectPath);
        if (!leaf?.projectPath) return null;
        return <SearchModal workspaceTabId={tab.id} projectRoot={leaf.projectPath} onClose={() => setSearchOpen(false)} />;
      })()}

      <UpdateBanner />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenLayoutPicker={() => setLayoutPickerOpen(true)}
        onQuickTask={() => setQuickTaskOpen(true)}
        onSearch={() => setSearchOpen(true)}
      />
      {switcher && <TerminalSwitcher items={filterSwitch(switcher.items, switcher.query)} activeIdx={switcher.idx} query={switcher.query} onPick={pickSwitch} />}
      {quickTaskOpen && <QuickTaskModal onClose={() => setQuickTaskOpen(false)} />}
      {layoutPickerOpen && (
        <LayoutPickerModal onClose={() => setLayoutPickerOpen(false)} onCreate={(layoutId: LayoutId, slots) => newTabWithLayout(layoutId, slots)} />
      )}
      {mdFile && <MarkdownViewer root={mdFile.root} path={mdFile.path} name={mdFile.name} onClose={() => setMdFile(null)} />}
      {cloneOpen && <CloneRepoModal onClose={() => setCloneOpen(false)} />}
      {tasksModalOpen && <TasksModal onClose={() => setTasksModalOpen(false)} onTogglePip={openTasksPip} pipActive={tasksPipOpen} />}
      {analyticsOpen && <AnalyticsModal onClose={() => setAnalyticsOpen(false)} onOpenPalette={() => setPaletteOpen(true)} />}
      {worktreesOpen && <WorktreesModal onClose={() => setWorktreesOpen(false)} />}
      {broadcastOpen && <BroadcastModal onClose={() => setBroadcastOpen(false)} />}
      <ToastContainer />
    </div>
  );
}

const DRAWER_META: Record<DrawerKind, string> = {
  sessions: 'Sessões do Claude',
  accounts: 'Contas Claude',
  git: 'Git',
  servers: 'Dev servers',
  skills: 'Skills',
  tasks: 'Tarefas',
  squad: 'Esquadrão',
};

function RightDrawer({ kind, onClose, tasksPipOpen, onTogglePip, onReturnPip }: {
  kind: DrawerKind;
  onClose: () => void;
  tasksPipOpen: boolean;
  onTogglePip: () => void;
  onReturnPip: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 z-40 flex h-full w-[360px] flex-col border-l border-border-default bg-bg-surface shadow-lg cmd-enter">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle px-3">
          <span className="text-[12px] font-semibold text-text-secondary">{DRAWER_META[kind]}</span>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PaneErrorBoundary>
            {kind === 'sessions' && <SessionsPane />}
            {kind === 'accounts' && <AccountsPane />}
            {kind === 'git' && <GitPane />}
            {kind === 'servers' && <ServersPane />}
            {kind === 'skills' && <SkillsPane />}
            {kind === 'squad' && <SquadPane />}
            {kind === 'tasks' && (tasksPipOpen ? <TasksPipPlaceholder onReturn={onReturnPip} /> : <TasksView onTogglePip={onTogglePip} />)}
          </PaneErrorBoundary>
        </div>
      </aside>
    </>
  );
}

/** Estado vazio do workspace — sem abas abertas. */
function EmptyWorkspace({ onAddFolder, onNewClaude, onOpenPalette }: {
  onAddFolder: () => void;
  onNewClaude: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-base p-8">
      <div className="flex max-w-md flex-col items-center gap-6 text-center welcome-fade">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
          <Sparkles size={30} className="text-white" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">Voltz IDE</h1>
          <p className="text-[13px] text-text-tertiary">Multiterminal para Claude Code &amp; Codex. Abra um projeto nos Favoritos ou comece um terminal.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={onNewClaude} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all hover:brightness-110" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <TerminalIcon size={15} /> Novo terminal com Claude
          </button>
          <button onClick={onAddFolder} className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:border-border-strong">
            <FolderOpen size={15} /> Adicionar pasta
          </button>
        </div>
        <button onClick={onOpenPalette} className="flex items-center gap-1.5 text-[12px] text-text-muted transition-colors hover:text-text-secondary">
          <Command size={12} /> Buscar tudo
          <kbd className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>
      </div>
    </div>
  );
}

/**
 * App enxuto da janela flutuante (BrowserWindow nativa alwaysOnTop, #pip=tasks).
 */
export function TasksPipApp() {
  usePomodoroDriver();
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void useTasksStore.getState().load();
  }, [loadSettings]);

  useEffect(() => {
    if (!settingsLoaded) return;
    applyTheme(settings.theme);
    void useProjectsStore.getState().scan(settings.rootFolders);
    if (settings.theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [settingsLoaded, settings.theme, settings.rootFolders]);

  return (
    <div className="flex h-screen w-screen flex-col bg-bg-base text-text-primary">
      <TasksView />
      <ToastContainer />
    </div>
  );
}

/** Barra de status inferior: estado vivo de todos os projetos. */
function StatusBar({ claudePath, shell, onActivateTasks, onOpenDrawer }: {
  claudePath: string | null;
  shell: string;
  onActivateTasks: () => void;
  onOpenDrawer: (d: DrawerKind) => void;
}) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const claudeByPane = useClaudeStatusStore((s) => s.byPane);
  const devByPath = useDevServersStore((s) => s.byPath);
  const gitByPath = useGitStore((s) => s.byPath);
  const tasks = useTasksStore((s) => s.tasks);

  const waiting = tabs.filter((t) => {
    const s = claudeOfTab(t.root, claudeByPane);
    return s === 'waiting' || s === 'approval';
  }).length;
  const devRunning = Object.values(devByPath).filter((d) => d.phase === 'running').length;
  const gitChanges = Object.values(gitByPath).reduce((sum, g) => sum + (g?.changes ?? 0), 0);

  const today = todayKey();
  const todays = tasks.filter((t) => t.date === today);
  const tasksDone = todays.filter((t) => t.done).length;
  const shellLabel = shell === 'pwsh' ? 'PowerShell' : shell === 'cmd' ? 'CMD' : shell === 'zsh' ? 'zsh' : 'Bash';

  return (
    <div className="flex items-center gap-1 border-t border-border-subtle bg-bg-surface px-2 py-1 text-[10px] text-text-muted">
      <Metric icon={<Sparkles size={11} />} value={waiting} label="aguardando" active={waiting > 0} color="var(--success)" pulse={waiting > 0} />
      <button onClick={() => onOpenDrawer('servers')} className="rounded px-0.5 transition-colors hover:bg-bg-hover">
        <Metric icon={<Globe size={11} />} value={devRunning} label="dev" active={devRunning > 0} color="var(--success)" />
      </button>
      <button onClick={() => onOpenDrawer('git')} className="rounded px-0.5 transition-colors hover:bg-bg-hover">
        <Metric icon={<GitBranch size={11} />} value={gitChanges} label="alterações" active={gitChanges > 0} color="var(--warning)" />
      </button>
      <button onClick={onActivateTasks} title="Abrir tarefas" className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-bg-hover hover:text-text-secondary">
        <ListChecks size={11} />
        <span className="font-semibold text-text-tertiary">{tasksDone}/{todays.length}</span>
        <span>hoje</span>
      </button>

      <span className="ml-auto flex items-center gap-1.5" title={claudePath ?? 'Claude não detectado'}>
        <span className={`h-1.5 w-1.5 rounded-full ${claudePath ? 'bg-success' : 'bg-danger'}`} style={{ boxShadow: claudePath ? '0 0 6px var(--success)' : '0 0 6px var(--danger)' }} />
        {claudePath ? claudePath.split(/[\\/]/).pop() : 'Claude não detectado'}
      </span>
      <span className="text-text-disabled">·</span>
      <span>{shellLabel}</span>
      <span className="text-text-disabled">·</span>
      <span className="text-text-disabled">v0.1.0</span>
    </div>
  );
}

function Metric({ icon, value, label, active, color, pulse }: {
  icon: React.ReactNode; value: number; label: string; active: boolean; color: string; pulse?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${pulse ? 'claude-dot' : ''}`} style={{ color: active ? color : 'var(--text-muted)' }}>
      {icon}
      <span className="font-semibold">{value}</span>
      <span style={{ opacity: active ? 0.8 : 1 }}>{label}</span>
    </span>
  );
}

function findFirstLeafId(node: PaneNode): string | null {
  if (node.kind === 'pane') return node.id;
  for (const c of node.children) { const r = findFirstLeafId(c); if (r) return r; }
  return null;
}

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

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 460;

function SidebarResizer({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      onChange(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startRef.current.w + dx)));
    }
    function onUp() { setDragging(false); startRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragging, onChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(e) => { startRef.current = { x: e.clientX, w: width }; setDragging(true); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => onChange(264)}
      title="Arraste para redimensionar · duplo-clique reseta"
      className="relative -ml-px h-full w-[3px] shrink-0 cursor-col-resize"
      style={{ background: dragging ? 'var(--accent)' : hover ? 'var(--accent-strong)' : 'transparent', transition: dragging ? 'none' : 'background-color 150ms ease' }}
    >
      <span aria-hidden className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
