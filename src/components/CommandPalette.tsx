import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Folder, ArrowRight, Play, Square, Globe,
  Sun, Moon, Monitor as MonitorIcon, Plus, LayoutGrid, Settings as SettingsIcon, CornerDownLeft,
  ListChecks, SearchCode, Radio,
} from 'lucide-react';
import { fuzzyMatch, highlightMatches, type FuzzyMatch } from '@/lib/fuzzy';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSettingsStore } from '@/stores/settings';
import { useDevServersStore } from '@/stores/devServers';
import { collectLeaves } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';
import { toast } from '@/stores/toasts';
import type { ThemeMode } from '@shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenLayoutPicker: () => void;
  onQuickTask?: () => void;
  onSearch?: () => void;
}

type GroupKey = 'projects' | 'tabs' | 'devservers' | 'actions' | 'theme';

interface Item {
  id: string;
  group: GroupKey;
  groupLabel: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** Avatar de inicial (projetos sem emoji) — render colorido. */
  initial?: string;
  color?: string;
  shortcut?: string;
  searchText: string;
  onSelect: () => void;
}

export function CommandPalette({ open, onClose, onOpenSettings, onOpenLayoutPicker, onQuickTask, onSearch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const toggleBroadcast = useWorkspaceStore((s) => s.toggleBroadcast);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const openProjectInNewTab = useWorkspaceStore((s) => s.openProjectInNewTab);
  const newTab = useWorkspaceStore((s) => s.newTab);
  const updateSettings = useSettingsStore((s) => s.update);
  const devServers = useDevServersStore((s) => s.byPath);
  const startDev = useDevServersStore((s) => s.start);
  const stopDev = useDevServersStore((s) => s.stop);
  const openInBrowser = useDevServersStore((s) => s.openInBrowser);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];

    for (const p of projects) {
      const c = selectCustom(customs, p.path);
      const name = c.alias || p.name;
      const color = c.color ?? getProjectColor(p.name).border;
      list.push({
        id: `project:${p.path}`,
        group: 'projects',
        groupLabel: 'Projetos',
        label: name,
        hint: shortPath(p.path),
        icon: c.emoji ? <span className="text-[15px] leading-none">{c.emoji}</span> : null,
        initial: c.emoji ? undefined : name.charAt(0).toUpperCase(),
        color,
        searchText: `${name} ${p.name} ${p.path}`,
        onSelect: () => { openProjectInNewTab(name, p.path); onClose(); },
      });

      const ds = devServers[p.path];
      const isRunning = ds?.phase === 'running' || ds?.phase === 'installing' || ds?.phase === 'starting';
      if (!isRunning) {
        list.push({
          id: `start-dev:${p.path}`,
          group: 'devservers',
          groupLabel: 'Dev Server',
          label: `Iniciar dev em ${name}`,
          hint: `${ds?.pm ?? 'npm'} run dev`,
          icon: <Play size={14} fill="currentColor" />,
          color: 'var(--accent)',
          searchText: `start dev iniciar ${name} ${p.name}`,
          onSelect: () => { void startDev(p.path); toast.info(`Iniciando dev · ${name}`); onClose(); },
        });
      }
    }

    for (const path of Object.keys(devServers)) {
      const ds = devServers[path];
      const proj = projects.find((p) => p.path === path);
      const name = proj ? (selectCustom(customs, path).alias || proj.name) : path;
      if (ds.phase === 'running' && ds.url) {
        list.push({
          id: `open-url:${path}`,
          group: 'devservers',
          groupLabel: 'Dev Server',
          label: `Abrir ${name} no navegador`,
          hint: ds.url,
          icon: <Globe size={14} />,
          color: 'var(--success)',
          searchText: `open browser ${name} ${ds.url}`,
          onSelect: () => { void openInBrowser(ds.url!); onClose(); },
        });
      }
      if (ds.phase === 'running' || ds.phase === 'installing' || ds.phase === 'starting') {
        list.push({
          id: `stop-dev:${path}`,
          group: 'devservers',
          groupLabel: 'Dev Server',
          label: `Parar dev em ${name}`,
          icon: <Square size={14} fill="currentColor" />,
          color: 'var(--danger)',
          searchText: `stop parar dev ${name}`,
          onSelect: () => { void stopDev(path); toast.info(`Parando dev · ${name}`); onClose(); },
        });
      }
    }

    for (const t of tabs) {
      const leaves = collectLeaves(t.root);
      const named = leaves.find((l) => l.projectName);
      const title = named?.projectName ?? t.title;
      list.push({
        id: `tab:${t.id}`,
        group: 'tabs',
        groupLabel: 'Abas abertas',
        label: title,
        hint: leaves.length > 1 ? `${leaves.length} terminais` : 'ir para a aba',
        icon: <ArrowRight size={14} />,
        searchText: `goto tab ${title}`,
        onSelect: () => { setActiveTab(t.id); onClose(); },
      });
    }

    if (onQuickTask) {
      list.push({
        id: 'action:new-task', group: 'actions', groupLabel: 'Ações',
        label: 'Nova tarefa', shortcut: 'Ctrl+Shift+A', icon: <ListChecks size={15} />,
        searchText: 'nova tarefa task todo adicionar',
        onSelect: () => { onClose(); onQuickTask(); },
      });
    }
    if (onSearch) {
      list.push({
        id: 'action:search', group: 'actions', groupLabel: 'Ações',
        label: 'Buscar no projeto', shortcut: 'Ctrl+Shift+F', icon: <SearchCode size={15} />,
        searchText: 'buscar search projeto texto código grep',
        onSelect: () => { onClose(); onSearch(); },
      });
    }
    list.push({
      id: 'action:new-tab', group: 'actions', groupLabel: 'Ações',
      label: 'Nova aba', shortcut: 'Ctrl+T', icon: <Plus size={15} />,
      searchText: 'new tab nova aba',
      onSelect: () => { newTab('Novo'); onClose(); },
    });
    list.push({
      id: 'action:layout', group: 'actions', groupLabel: 'Ações',
      label: 'Novo layout multi-terminal', icon: <LayoutGrid size={15} />,
      searchText: 'layout split multi terminal',
      onSelect: () => { onClose(); onOpenLayoutPicker(); },
    });

    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab) {
      const termCount = collectLeaves(activeTab.root).filter((l) => l.viewMode !== 'browser').length;
      if (termCount >= 2) {
        const on = !!activeTab.broadcast;
        list.push({
          id: 'action:broadcast', group: 'actions', groupLabel: 'Ações',
          label: on ? 'Broadcast: desligar entrada sincronizada' : 'Broadcast: ligar entrada sincronizada',
          hint: `${termCount} terminais nesta aba`,
          icon: <Radio size={15} />,
          color: on ? '#f59e0b' : undefined,
          searchText: 'broadcast sincronizar entrada terminais todos synchronize panes espelhar digitar',
          onSelect: () => {
            toggleBroadcast(activeTab.id);
            toast.info(on ? 'Broadcast desligado' : 'Broadcast ligado', on ? undefined : 'Sua entrada agora vai para todos os terminais desta aba.');
            onClose();
          },
        });
      }
    }
    list.push({
      id: 'action:settings', group: 'actions', groupLabel: 'Ações',
      label: 'Configurações', icon: <SettingsIcon size={15} />,
      searchText: 'settings configurações preferências',
      onSelect: () => { onClose(); onOpenSettings(); },
    });

    const setTheme = (m: ThemeMode) => () => {
      void updateSettings({ theme: m });
      toast.success('Tema alterado', `Modo: ${m}`);
      onClose();
    };
    list.push({ id: 'theme:system', group: 'theme', groupLabel: 'Tema', label: 'Tema: Sistema', icon: <MonitorIcon size={15} />, searchText: 'theme system tema sistema automático', onSelect: setTheme('system') });
    list.push({ id: 'theme:light', group: 'theme', groupLabel: 'Tema', label: 'Tema: Claro', icon: <Sun size={15} />, searchText: 'theme light tema claro light mode', onSelect: setTheme('light') });
    list.push({ id: 'theme:dark', group: 'theme', groupLabel: 'Tema', label: 'Tema: Escuro', icon: <Moon size={15} />, searchText: 'theme dark tema escuro dark mode', onSelect: setTheme('dark') });

    return list;
  }, [projects, customs, tabs, activeTabId, toggleBroadcast, devServers, openProjectInNewTab, newTab, updateSettings,
      onClose, onOpenSettings, onOpenLayoutPicker, onQuickTask, onSearch, setActiveTab, startDev, stopDev, openInBrowser]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return items
        .filter((it) => it.group === 'projects' || it.group === 'tabs')
        .slice(0, 30)
        .map((it) => ({ item: it, match: { score: 0, positions: [] } as FuzzyMatch }));
    }
    const out: { item: Item; match: FuzzyMatch }[] = [];
    for (const it of items) {
      const m = fuzzyMatch(it.searchText, query);
      if (m) out.push({ item: it, match: m });
    }
    out.sort((a, b) => b.match.score - a.match.score);
    return out.slice(0, 50);
  }, [items, query]);

  const groupedResults = useMemo(() => {
    const groups: { key: GroupKey; label: string; items: typeof filtered }[] = [];
    const order: GroupKey[] = ['projects', 'tabs', 'devservers', 'actions', 'theme'];
    for (const k of order) {
      const arr = filtered.filter((r) => r.item.group === k);
      if (arr.length === 0) continue;
      groups.push({ key: k, label: arr[0].item.groupLabel, items: arr });
    }
    return groups;
  }, [filtered]);

  const flat = useMemo(() => groupedResults.flatMap((g) => g.items), [groupedResults]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); flat[activeIdx]?.item.onSelect(); }
    else if (e.key === 'Tab') { e.preventDefault(); setActiveIdx((i) => (i + 1) % Math.max(1, flat.length)); }
  }

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cmd-enter flex w-full max-w-[660px] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-overlay"
        style={{ boxShadow: '0 24px 70px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)' }}
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={18} className="shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar projetos, abas, ações…"
            className="flex-1 bg-transparent text-[15.5px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded-md bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-muted">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto px-2 py-1.5">
          {flat.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-text-muted">
              Nenhum resultado para <span className="font-mono text-text-secondary">"{query}"</span>
            </div>
          ) : (
            groupedResults.map((g) => (
              <div key={g.key} className="mb-1">
                <div className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-text-muted">
                  {g.label}
                </div>
                {g.items.map(({ item }) => {
                  const idx = runningIdx++;
                  const isActive = idx === activeIdx;
                  const accent = item.color ?? 'var(--accent)';
                  return (
                    <button
                      key={item.id}
                      data-cmd-idx={idx}
                      onMouseMove={() => setActiveIdx(idx)}
                      onClick={() => item.onSelect()}
                      className="relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
                      style={{
                        background: isActive
                          ? `color-mix(in srgb, ${accent} 14%, var(--bg-active))`
                          : 'transparent',
                      }}
                    >
                      {isActive && (
                        <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: accent }} />
                      )}
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-bold"
                        style={{
                          background: item.color ? `color-mix(in srgb, ${item.color} 20%, transparent)` : 'var(--bg-active)',
                          color: item.color ?? 'var(--text-secondary)',
                          boxShadow: item.color ? `inset 0 0 0 1px color-mix(in srgb, ${item.color} 32%, transparent)` : 'inset 0 0 0 1px var(--border-subtle)',
                        }}
                      >
                        {item.initial ?? item.icon}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-medium text-text-primary">
                          {query ? highlightMatches(item.label, labelPositions(item.label, query)) : item.label}
                        </span>
                        {item.hint && <span className="truncate text-[11px] text-text-muted">{item.hint}</span>}
                      </div>
                      {item.shortcut ? (
                        <kbd className="shrink-0 rounded-md bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-muted">{item.shortcut}</kbd>
                      ) : isActive ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-md border border-accent-strong bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          <CornerDownLeft size={11} /> abrir
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-text-muted" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
            <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> abrir</span>
            <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> fechar</span>
          </div>
          <span className="tabular-nums">{flat.length} resultado(s)</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[16px] items-center justify-center rounded bg-bg-active px-1 py-0.5 font-mono text-[9px] text-text-tertiary">
      {children}
    </kbd>
  );
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length <= 3) return p.replace(/\\/g, '/');
  return '…/' + parts.slice(-2).join('/');
}

function labelPositions(label: string, query: string): number[] {
  const m = fuzzyMatch(label, query);
  return m?.positions ?? [];
}
