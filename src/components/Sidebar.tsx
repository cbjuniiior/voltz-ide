import { forwardRef, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, FolderPlus, Folder, FolderOpen,
  GitBranch, RefreshCw, Search, Github,
  Star, TerminalSquare, Pencil, FileText, FileCode, FileJson,
} from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { getProjectColor } from '@/lib/projectColors';
import { ProjectEditPopover } from './ProjectEditPopover';
import { CloneRepoModal } from './CloneRepoModal';
import { DevServerControl } from './DevServerControl';
import { useDevServersStore, selectDevServer } from '@/stores/devServers';
import type { Project, DirEntry } from '@shared/types';

interface Props {
  onOpenPalette: () => void;
}

type SidebarTab = 'all' | 'favorites';

export function Sidebar({ onOpenPalette }: Props) {
  const projects = useProjectsStore((s) => s.projects);
  const filter = useProjectsStore((s) => s.filter);
  const setFilter = useProjectsStore((s) => s.setFilter);
  const scan = useProjectsStore((s) => s.scan);
  const scanning = useProjectsStore((s) => s.scanning);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const openProjectInNewTab = useWorkspaceStore((s) => s.openProjectInNewTab);
  const customs = useProjectCustomStore((s) => s.customs);

  const [tab, setTab] = useState<SidebarTab>('all');
  const [showClone, setShowClone] = useState(false);
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<{ project: Project; anchor: HTMLElement } | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, DirEntry[]>>(new Map());

  async function toggleExpand(dirPath: string) {
    const next = new Set(expandedPaths);
    if (next.has(dirPath)) {
      next.delete(dirPath);
    } else {
      next.add(dirPath);
      if (!dirCache.has(dirPath)) {
        const entries = await window.api.projects.readDir(dirPath);
        setDirCache((prev) => new Map(prev).set(dirPath, entries));
      }
    }
    setExpandedPaths(next);
  }

  async function addRoot() {
    const folder = await window.api.dialog.pickFolder();
    if (!folder) return;
    if (settings.rootFolders.includes(folder)) return;
    const next = [...settings.rootFolders, folder];
    await update({ rootFolders: next });
    await scan(next);
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q ? projects.filter((p) => {
      const c = customs[p.path];
      const displayName = c?.alias || p.name;
      return displayName.toLowerCase().includes(q);
    }) : projects;
    if (tab === 'favorites') return base.filter((p) => customs[p.path]?.favorite);
    return base;
  }, [projects, filter, tab, customs]);

  const grouped = useMemo(() => {
    if (tab === 'favorites') return new Map<string, Project[]>([['★ Favoritos', filtered]]);
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      if (!map.has(p.rootFolder)) map.set(p.rootFolder, []);
      map.get(p.rootFolder)!.push(p);
    }
    return map;
  }, [filtered, tab]);

  const favCount = useMemo(
    () => projects.filter((p) => customs[p.path]?.favorite).length,
    [projects, customs],
  );

  const rootLabel = (root: string) =>
    root === '★ Favoritos' ? root : (root.split(/[\\/]/).filter(Boolean).pop() ?? root);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 pb-2 pt-3.5">
        <h2 className="flex-1 text-[14px] font-semibold tracking-tight text-text-primary">Projetos</h2>
        <ToolbarBtn
          onClick={() => scan(settings.rootFolders)}
          disabled={scanning || settings.rootFolders.length === 0}
          title="Atualizar lista"
        >
          <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => setShowClone(true)} title="Clonar repositório do GitHub">
          <Github size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={addRoot} title="Adicionar pasta raiz">
          <FolderPlus size={13} />
        </ToolbarBtn>
      </div>
      {showClone && <CloneRepoModal onClose={() => setShowClone(false)} />}

      {/* Tab pills — soft segmented control */}
      <div className="mx-2 mb-2 flex gap-0.5 rounded-lg bg-bg-base p-0.5">
        {([['all', 'Projetos', projects.length], ['favorites', 'Favoritos', favCount]] as const).map(([id, label, count]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-medium transition-all"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: active ? 'var(--bg-surface)' : 'transparent',
                boxShadow: active ? 'var(--shadow-sm)' : undefined,
              }}
            >
              {id === 'favorites' && (
                <Star size={11} fill={active ? 'currentColor' : 'none'} style={{ color: active ? 'var(--warning)' : undefined }} />
              )}
              {label}
              <span
                className="rounded px-1 text-[10px] font-semibold"
                style={{
                  background: active ? 'var(--bg-active)' : 'transparent',
                  color: 'var(--text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + command palette button */}
      <div className="space-y-1.5 border-b border-border-subtle px-2 py-2">
        <button
          onClick={onOpenPalette}
          className="group flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-left transition-all hover:border-accent"
          title="Command Palette (Ctrl+K)"
        >
          <Search size={12} className="text-text-muted transition-colors group-hover:text-accent" />
          <span className="flex-1 text-[12px] text-text-muted">Buscar tudo…</span>
          <kbd className="rounded bg-bg-active px-1 py-0.5 font-mono text-[9px] text-text-muted transition-colors group-hover:text-accent">
            Ctrl+K
          </kbd>
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 transition-colors focus-within:border-accent">
          <Search size={12} className="text-text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar lista…"
            className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="text-text-muted hover:text-text-primary"
              aria-label="Limpar busca"
            >×</button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {settings.rootFolders.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="rounded-xl p-3" style={{ background: 'var(--accent-soft)' }}>
              <FolderPlus size={22} className="text-accent" />
            </div>
            <p className="text-xs text-text-tertiary">Adicione uma pasta raiz<br />para listar projetos</p>
            <button
              onClick={addRoot}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                borderColor: 'var(--accent-strong)',
              }}
            >
              + Adicionar pasta
            </button>
          </div>
        )}

        {tab === 'favorites' && favCount === 0 && settings.rootFolders.length > 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="rounded-xl p-3" style={{ background: 'var(--warning-soft)' }}>
              <Star size={22} className="text-warning" />
            </div>
            <p className="text-xs text-text-tertiary">
              Nenhum favorito ainda.<br />
              Hover num projeto e clique em <Pencil size={10} className="inline" /> para editar.
            </p>
          </div>
        )}

        {[...grouped.entries()].map(([root, items]) => {
          const collapsed = collapsedRoots.has(root);
          const label = rootLabel(root);
          return (
            <div key={root} className="mb-2">
              <button
                onClick={() => setCollapsedRoots((prev) => {
                  const next = new Set(prev);
                  if (next.has(root)) next.delete(root); else next.add(root);
                  return next;
                })}
                className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-text-muted transition-colors hover:bg-bg-hover hover:text-text-tertiary"
              >
                {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                <span className="flex-1 truncate text-[10px] font-bold uppercase tracking-[0.12em]" title={root}>
                  {label}
                </span>
                <span className="text-[10px] text-text-disabled">{items.length}</span>
              </button>

              {!collapsed && items.map((p) => (
                <div key={p.id}>
                  <ProjectItem
                    project={p}
                    expanded={expandedPaths.has(p.path)}
                    onToggleExpand={() => void toggleExpand(p.path)}
                    onOpen={() => openProjectInNewTab(
                      customs[p.path]?.alias || p.name,
                      p.path,
                    )}
                    onEdit={(anchor) => setEditTarget({ project: p, anchor })}
                  />
                  {expandedPaths.has(p.path) && (
                    <div>
                      {(dirCache.get(p.path) || []).map((entry) => (
                        <DirTreeNode
                          key={entry.path}
                          entry={entry}
                          depth={1}
                          expandedPaths={expandedPaths}
                          dirCache={dirCache}
                          onToggle={(dp) => void toggleExpand(dp)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {projects.length > 0 && (
        <div className="border-t border-border-subtle px-3 py-2 text-[10px] text-text-muted">
          {projects.length} projeto(s) · {settings.rootFolders.length} pasta(s)
        </div>
      )}

      {editTarget && (
        <ProjectEditPopover
          projectPath={editTarget.project.path}
          projectName={editTarget.project.name}
          anchor={editTarget.anchor}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md p-1.5 text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ---- ProjectItem ---- */
function ProjectItem({ project, expanded, onToggleExpand, onOpen, onEdit }: {
  project: Project;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
  onEdit: (anchor: HTMLElement) => void;
}) {
  const custom = useProjectCustomStore((s) => selectCustom(s.customs, project.path));
  const toggleFav = useProjectCustomStore((s) => s.toggleFavorite);
  const devServer = useDevServersStore((s) => selectDevServer(s.byPath, project.path));
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const devActive = !!devServer && devServer.phase !== 'idle' && devServer.phase !== 'stopped';

  const autoColor = getProjectColor(project.name);
  const borderColor = custom.color ?? autoColor.border;
  const textColor = custom.color ?? autoColor.text;
  const badgeBg = (custom.color ?? autoColor.badge) + '2e';
  const displayName = custom.alias || project.name;
  const hasEmoji = !!custom.emoji;

  const dotColor = devServer?.phase === 'running' ? 'var(--success)' :
                   devServer?.phase === 'error' ? 'var(--danger)' :
                   'var(--warning)';

  return (
    <div className="project-item group relative mx-2 flex items-center rounded-lg transition-colors hover:bg-bg-hover"
      style={{ width: 'calc(100% - 16px)' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        className="flex h-full shrink-0 items-center px-1 py-2 text-text-muted hover:text-text-secondary"
        title={expanded ? 'Recolher' : 'Expandir pasta'}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>

      <button
        onClick={onToggleExpand}
        className="flex flex-1 items-center gap-2.5 py-2 text-left min-w-0 pr-1.5"
        title={project.path}
      >
        <span
          className="project-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base transition-transform"
          style={{ background: badgeBg }}
        >
          {hasEmoji
            ? custom.emoji
            : (expanded
              ? <FolderOpen size={13} style={{ color: textColor }} />
              : <Folder size={13} style={{ color: textColor }} />)}
        </span>

        <span className="flex-1 break-words text-[12.5px] font-medium leading-snug text-text-secondary">
          {displayName}
        </span>

        {devActive && (
          <span
            title={devServer?.phase === 'running' ? 'Dev server rodando' : 'Dev server iniciando'}
            className="claude-dot inline-block shrink-0 rounded-full group-hover:hidden"
            style={{ width: 6, height: 6, background: dotColor }}
          />
        )}

        {custom.favorite && (
          <Star
            size={11}
            fill="currentColor"
            className={`shrink-0 text-warning ${devActive ? 'hidden group-hover:inline' : ''}`}
          />
        )}
        {project.isGit && !custom.favorite && !devActive && (
          <GitBranch size={11} className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </button>

      {/* Hover actions */}
      <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <DevServerControl projectPath={project.path} variant="sidebar" accent={borderColor} />
        <ItemBtn
          onClick={(e) => { e.stopPropagation(); void toggleFav(project.path); }}
          title={custom.favorite ? 'Remover favorito' : 'Favoritar'}
          color={custom.favorite ? 'var(--warning)' : undefined}
        >
          <Star size={11} fill={custom.favorite ? 'currentColor' : 'none'} />
        </ItemBtn>
        <ItemBtn
          ref={editBtnRef}
          onClick={(e) => { e.stopPropagation(); if (editBtnRef.current) onEdit(editBtnRef.current); }}
          title="Editar nome/emoji/cor"
        >
          <Pencil size={11} />
        </ItemBtn>
        <ItemBtn
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          title="Abrir terminal"
          color="var(--accent)"
        >
          <TerminalSquare size={11} />
        </ItemBtn>
      </div>
    </div>
  );
}

const ItemBtn = forwardRef<HTMLButtonElement, {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  color?: string;
}>(function ItemBtn({ children, onClick, title, color }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      className="rounded p-1 transition-colors hover:bg-bg-active"
      style={{ color: color ?? 'var(--text-muted)' }}
    >
      {children}
    </button>
  );
});

/* ---- DirTreeNode ---- */
function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'rs', 'go', 'cpp', 'c', 'cs'].includes(ext))
    return <FileCode size={11} />;
  if (ext === 'json') return <FileJson size={11} />;
  return <FileText size={11} />;
}

function DirTreeNode({ entry, depth, expandedPaths, dirCache, onToggle }: {
  entry: DirEntry;
  depth: number;
  expandedPaths: Set<string>;
  dirCache: Map<string, DirEntry[]>;
  onToggle: (p: string) => void;
}) {
  const expanded = expandedPaths.has(entry.path);
  const children = dirCache.get(entry.path) ?? [];
  const indent = depth * 12 + 12;

  return (
    <div>
      <button
        onClick={() => entry.isDir && onToggle(entry.path)}
        className={`flex w-full items-center gap-1.5 py-0.5 text-left text-[11px] transition-colors hover:bg-bg-hover ${entry.isDir ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ paddingLeft: indent, color: entry.isDir ? 'var(--text-tertiary)' : 'var(--text-muted)' }}
        title={entry.path}
      >
        {entry.isDir ? (
          expanded ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />
        ) : <span className="shrink-0" style={{ width: 10 }} />}
        <span className="shrink-0" style={{ color: entry.isDir ? 'var(--accent)' : 'var(--text-muted)' }}>
          {entry.isDir
            ? (expanded ? <FolderOpen size={11} /> : <Folder size={11} />)
            : fileIcon(entry.name)}
        </span>
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.isDir && expanded && children.map((child) => (
        <DirTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          dirCache={dirCache}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
