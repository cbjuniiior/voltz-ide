import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen,
  FileText, FileCode, FileJson, FileType, FileImage,
  Plus, FilePlus, FolderPlus, Trash2, RefreshCw, Pencil,
  Play, ExternalLink, TerminalSquare, PanelLeftClose,
} from 'lucide-react';
import type { DirEntry } from '@shared/types';
import { useEditorStore } from '@/stores/editor';
import { useDevServersStore } from '@/stores/devServers';
import { useWorkspaceStore } from '@/stores/workspace';
import { toast } from '@/stores/toasts';

interface Props {
  workspaceTabId: string;
  projectRoot: string;
  projectName: string;
  /** Oculta o painel da árvore (botão no header). */
  onCollapse?: () => void;
}

interface ContextMenu {
  x: number;
  y: number;
  target: { path: string; isDir: boolean; name: string };
}

interface RenameState {
  path: string;
  isDir: boolean;
  initialName: string;
  parentPath: string;
}

export function FileTreePanel({ workspaceTabId, projectRoot, projectName, onCollapse }: Props) {
  const [entries, setEntries] = useState<Map<string, DirEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set([projectRoot]));
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [creating, setCreating] = useState<{ parentPath: string; kind: 'file' | 'directory' } | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const openFile = useEditorStore((s) => s.openFile);
  const forgetFile = useEditorStore((s) => s.forgetFile);
  const startDevServer = useDevServersStore((s) => s.start);
  const openFolderInSplit = useWorkspaceStore((s) => s.openFolderInSplit);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleStartDevServer(folderPath: string, folderName: string) {
    toast.info('Iniciando dev server', folderName);
    await startDevServer(folderPath);
    // Status (running/error/url) é refletido em tempo real pela
    // useDevServersStore via evento devServer:update.
  }

  function handleOpenTerminal(folderPath: string, folderName: string) {
    openFolderInSplit(workspaceTabId, folderName, folderPath);
    toast.info('Terminal aberto', folderName);
  }

  async function handleOpenInExplorer(target: string) {
    const result = await window.api.system.openInExplorer(target);
    if (!result.ok) {
      toast.error('Não consegui abrir', result.error);
    }
  }

  // F2 starts rename on the currently selected entry.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'F2' || !selectedPath || renaming) return;
      // Locate the entry by walking the entries map (cheap, finite).
      for (const list of entries.values()) {
        const found = list.find((en) => en.path === selectedPath);
        if (found) {
          e.preventDefault();
          const parent = found.path.replace(/[\\/][^\\/]+$/, '');
          setRenaming({ path: found.path, isDir: found.isDir, initialName: found.name, parentPath: parent });
          setRenameValue(found.name);
          return;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPath, entries, renaming]);

  async function commitRename() {
    if (!renaming) return;
    const newName = renameValue.trim();
    if (!newName || newName === renaming.initialName) {
      setRenaming(null);
      return;
    }
    const sep = renaming.parentPath.includes('\\') ? '\\' : '/';
    const newPath = `${renaming.parentPath}${sep}${newName}`;
    const result = await window.api.files.rename(projectRoot, renaming.path, newPath);
    if (!result.ok) {
      toast.error('Não consegui renomear', result.error);
      return;
    }
    // Close the open buffer if the file was renamed and reopen at the new path
    forgetFile(workspaceTabId, renaming.path);
    if (!renaming.isDir) {
      await openFile(workspaceTabId, projectRoot, newPath);
    }
    await loadDir(renaming.parentPath);
    setRenaming(null);
    setRenameValue('');
  }

  // Load the root the first time, plus any dir we expand.
  useEffect(() => {
    if (!entries.has(projectRoot)) {
      void loadDir(projectRoot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);

  // Start/stop a chokidar watcher for this project root. When something
  // changes on disk, refresh the dir that contains it so the tree stays
  // accurate without the user having to hit refresh.
  useEffect(() => {
    void window.api.files.watchStart(projectRoot);
    const off = window.api.files.onWatchEvent((evt) => {
      if (evt.root !== projectRoot) return;
      // The "path" reported by chokidar is absolute. Refresh its parent dir
      // if we've already loaded that dir (otherwise no work to do).
      const parent = evt.path.replace(/[\\/][^\\/]+$/, '');
      setEntries((prev) => {
        if (!prev.has(parent)) return prev;
        // Schedule a refresh but keep current entries until it returns.
        void window.api.projects.readDir(parent).then((list) => {
          setEntries((cur) => new Map(cur).set(parent, list));
        });
        return prev;
      });
    });
    return () => {
      off();
      void window.api.files.watchStop(projectRoot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);

  async function loadDir(dirPath: string) {
    const list = await window.api.projects.readDir(dirPath);
    setEntries((prev) => new Map(prev).set(dirPath, list));
  }

  async function refreshTree() {
    const dirs = Array.from(entries.keys());
    const next = new Map<string, DirEntry[]>();
    for (const d of dirs) {
      try {
        next.set(d, await window.api.projects.readDir(d));
      } catch { /* skip removed dirs */ }
    }
    setEntries(next);
  }

  async function toggleExpand(dirPath: string) {
    if (expanded.has(dirPath)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    } else {
      if (!entries.has(dirPath)) await loadDir(dirPath);
      setExpanded((prev) => new Set(prev).add(dirPath));
    }
  }

  function openContextMenu(e: React.MouseEvent, target: ContextMenu['target']) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  }

  // Dismiss context menu on outside click / Esc
  useEffect(() => {
    if (!ctxMenu) return;
    function onDown(e: MouseEvent) {
      const tgt = e.target as HTMLElement;
      if (!tgt.closest('[data-ctx-menu]')) setCtxMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setCtxMenu(null); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  async function handleCreate(parentPath: string, name: string, kind: 'file' | 'directory') {
    if (!name.trim()) {
      setCreating(null);
      return;
    }
    const targetPath = `${parentPath.replace(/[\\/]+$/, '')}/${name.trim()}`;
    const result = await window.api.files.create(projectRoot, targetPath, kind);
    if (!result.ok) {
      toast.error('Não consegui criar', result.error);
      return;
    }
    // Refresh the parent dir and auto-expand it; if it was a file, open it.
    setExpanded((prev) => new Set(prev).add(parentPath));
    await loadDir(parentPath);
    setCreating(null);
    setCreatingName('');
    if (kind === 'file') {
      // Normalize separator the way Node returns it on read.
      const normalised = (await window.api.projects.readDir(parentPath))
        .find((e) => e.name === name.trim())?.path;
      if (normalised) void openFile(workspaceTabId, projectRoot, normalised);
    }
  }

  async function handleDelete(entry: { path: string; isDir: boolean; name: string }) {
    const ok = window.confirm(
      entry.isDir
        ? `Apagar a pasta "${entry.name}" e tudo dentro dela? Não dá pra desfazer.`
        : `Apagar "${entry.name}"? Não dá pra desfazer.`,
    );
    if (!ok) return;
    const result = await window.api.files.delete(projectRoot, entry.path);
    if (!result.ok) {
      toast.error('Não consegui apagar', result.error);
      return;
    }
    forgetFile(workspaceTabId, entry.path);
    // Reload the parent dir
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '');
    await loadDir(parent);
    toast.info('Apagado', entry.name);
  }

  // Render
  const rootEntries = entries.get(projectRoot) ?? [];

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-bg-surface">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-border-subtle px-2.5 py-2">
        <Folder size={12} className="text-text-tertiary" />
        <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary" title={projectRoot}>
          {projectName}
        </span>
        <button
          onClick={() => setCreating({ parentPath: projectRoot, kind: 'file' })}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Novo arquivo"
        >
          <FilePlus size={12} />
        </button>
        <button
          onClick={() => setCreating({ parentPath: projectRoot, kind: 'directory' })}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Nova pasta"
        >
          <FolderPlus size={12} />
        </button>
        <button
          onClick={() => void refreshTree()}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Recarregar"
        >
          <RefreshCw size={12} />
        </button>
        {onCollapse && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border-subtle" />
            <button
              onClick={onCollapse}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              title="Ocultar árvore de arquivos"
            >
              <PanelLeftClose size={13} />
            </button>
          </>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1" onContextMenu={(e) => {
        // Right-click on empty space → menu para criar na raiz
        if ((e.target as HTMLElement).closest('[data-tree-row]')) return;
        openContextMenu(e, { path: projectRoot, isDir: true, name: projectName });
      }}>
        {creating?.parentPath === projectRoot && (
          <CreateRow
            depth={0}
            kind={creating.kind}
            value={creatingName}
            onChange={setCreatingName}
            onConfirm={() => handleCreate(projectRoot, creatingName, creating.kind)}
            onCancel={() => { setCreating(null); setCreatingName(''); }}
          />
        )}
        {rootEntries.map((entry) => (
          <TreeRow
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            entries={entries}
            creating={creating}
            creatingName={creatingName}
            onCreatingNameChange={setCreatingName}
            onCreateConfirm={(parent, name, kind) => handleCreate(parent, name, kind)}
            onCreateCancel={() => { setCreating(null); setCreatingName(''); }}
            onToggle={toggleExpand}
            onOpenFile={(p) => void openFile(workspaceTabId, projectRoot, p)}
            onOpenTerminal={handleOpenTerminal}
            onStartDev={(p, n) => void handleStartDevServer(p, n)}
            onContextMenu={openContextMenu}
            renaming={renaming}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => { setRenaming(null); setRenameValue(''); }}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onStartRename={(en) => {
              setRenaming({ path: en.path, isDir: en.isDir, initialName: en.name, parentPath: en.path.replace(/[\\/][^\\/]+$/, '') });
              setRenameValue(en.name);
            }}
          />
        ))}
      </div>

      {ctxMenu && (
        <ContextMenuPopover
          x={ctxMenu.x}
          y={ctxMenu.y}
          target={ctxMenu.target}
          onClose={() => setCtxMenu(null)}
          onNewFile={(parent) => {
            setCtxMenu(null);
            setCreating({ parentPath: parent, kind: 'file' });
            setCreatingName('');
            setExpanded((prev) => new Set(prev).add(parent));
            if (!entries.has(parent)) void loadDir(parent);
          }}
          onNewFolder={(parent) => {
            setCtxMenu(null);
            setCreating({ parentPath: parent, kind: 'directory' });
            setCreatingName('');
            setExpanded((prev) => new Set(prev).add(parent));
            if (!entries.has(parent)) void loadDir(parent);
          }}
          onRename={(t) => {
            setCtxMenu(null);
            setRenaming({ path: t.path, isDir: t.isDir, initialName: t.name, parentPath: t.path.replace(/[\\/][^\\/]+$/, '') });
            setRenameValue(t.name);
          }}
          onDelete={(t) => { setCtxMenu(null); void handleDelete(t); }}
          onStartDevServer={(t) => { setCtxMenu(null); void handleStartDevServer(t.path, t.name); }}
          onOpenInExplorer={(t) => { setCtxMenu(null); void handleOpenInExplorer(t.path); }}
          isRoot={ctxMenu.target.path === projectRoot}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tree row
// ============================================================================

interface TreeRowProps {
  entry: DirEntry;
  depth: number;
  expanded: Set<string>;
  entries: Map<string, DirEntry[]>;
  creating: { parentPath: string; kind: 'file' | 'directory' } | null;
  creatingName: string;
  onCreatingNameChange: (v: string) => void;
  onCreateConfirm: (parent: string, name: string, kind: 'file' | 'directory') => void;
  onCreateCancel: () => void;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onOpenTerminal: (path: string, name: string) => void;
  onStartDev: (path: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, target: { path: string; isDir: boolean; name: string }) => void;
  renaming: RenameState | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onStartRename: (entry: { path: string; isDir: boolean; name: string }) => void;
}

function TreeRow(p: TreeRowProps) {
  const { entry, depth, expanded, entries, creating, renaming, selectedPath } = p;
  const isOpen = expanded.has(entry.path);
  const children = entries.get(entry.path) ?? [];
  const indent = depth * 14 + 8;
  const isRenaming = renaming?.path === entry.path;
  const isSelected = selectedPath === entry.path;

  return (
    <div>
      <div
        data-tree-row
        onClick={() => {
          p.onSelect(entry.path);
          if (!isRenaming) {
            if (entry.isDir) p.onToggle(entry.path);
            else p.onOpenFile(entry.path);
          }
        }}
        onDoubleClick={(e) => {
          // Double-click on a file already opens, on a folder toggles — no
          // change needed. Reserve double-click for an explicit rename only
          // when the alt key is held, to avoid conflict with VSCode-style
          // F2 (which we already support).
          if (e.altKey) {
            e.preventDefault();
            p.onStartRename({ path: entry.path, isDir: entry.isDir, name: entry.name });
          }
        }}
        onContextMenu={(e) => p.onContextMenu(e, { path: entry.path, isDir: entry.isDir, name: entry.name })}
        className="group flex cursor-pointer items-center gap-1 py-0.5 pr-2 text-[11.5px] transition-colors"
        style={{
          paddingLeft: indent,
          background: isSelected ? 'var(--bg-active)' : undefined,
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = ''; }}
        title={entry.path}
      >
        {entry.isDir ? (
          isOpen
            ? <ChevronDown size={11} className="shrink-0 text-text-muted" />
            : <ChevronRight size={11} className="shrink-0 text-text-muted" />
        ) : <span className="shrink-0" style={{ width: 11 }} />}
        <span className="shrink-0">{iconForEntry(entry, isOpen)}</span>
        {isRenaming
          ? <RenameInput
              value={p.renameValue}
              onChange={p.onRenameChange}
              onCommit={p.onRenameCommit}
              onCancel={p.onRenameCancel}
            />
          : <span className="flex-1 truncate text-text-secondary">{entry.name}</span>}
        {entry.isDir && !isRenaming && (
          <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); p.onOpenTerminal(entry.path, entry.name); }}
              title="Abrir terminal nesta pasta (divide a aba atual)"
              className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
            >
              <TerminalSquare size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); p.onStartDev(entry.path, entry.name); }}
              title="Rodar dev server (install + dev) nesta pasta"
              className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-accent"
            >
              <Play size={11} fill="currentColor" />
            </button>
          </div>
        )}
      </div>

      {entry.isDir && isOpen && (
        <>
          {creating?.parentPath === entry.path && (
            <CreateRow
              depth={depth + 1}
              kind={creating.kind}
              value={p.creatingName}
              onChange={p.onCreatingNameChange}
              onConfirm={() => p.onCreateConfirm(entry.path, p.creatingName, creating.kind)}
              onCancel={p.onCreateCancel}
            />
          )}
          {children.map((child) => (
            <TreeRow {...p} key={child.path} entry={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}

function RenameInput({
  value, onChange, onCommit, onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Pre-select up to the extension so the user can replace the name fast.
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dotIdx = value.lastIndexOf('.');
    if (dotIdx > 0) el.setSelectionRange(0, dotIdx);
    else el.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onCommit();
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => { if (value.trim()) onCommit(); else onCancel(); }}
      className="flex-1 rounded border border-accent bg-bg-base px-1 py-px text-[11.5px] text-text-primary outline-none"
    />
  );
}

// ============================================================================
// Create row (inline file/folder name input)
// ============================================================================

function CreateRow({
  depth, kind, value, onChange, onConfirm, onCancel,
}: {
  depth: number;
  kind: 'file' | 'directory';
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const indent = depth * 14 + 8;
  return (
    <div
      className="flex items-center gap-1 py-0.5 pr-2"
      style={{ paddingLeft: indent }}
    >
      <span className="shrink-0" style={{ width: 11 }} />
      <span className="shrink-0">
        {kind === 'directory' ? <Folder size={12} className="text-text-tertiary" /> : <FileText size={12} className="text-text-tertiary" />}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => { if (value.trim()) onConfirm(); else onCancel(); }}
        placeholder={kind === 'directory' ? 'pasta nova' : 'arquivo.ext'}
        className="flex-1 rounded border border-accent bg-bg-base px-1 py-px text-[11.5px] text-text-primary outline-none"
      />
    </div>
  );
}

// ============================================================================
// Context menu popover
// ============================================================================

function ContextMenuPopover({
  x, y, target, onClose, onNewFile, onNewFolder, onRename, onDelete,
  onStartDevServer, onOpenInExplorer, isRoot,
}: {
  x: number;
  y: number;
  target: { path: string; isDir: boolean; name: string };
  onClose: () => void;
  onNewFile: (parent: string) => void;
  onNewFolder: (parent: string) => void;
  onRename: (target: { path: string; isDir: boolean; name: string }) => void;
  onDelete: (target: { path: string; isDir: boolean; name: string }) => void;
  onStartDevServer: (target: { path: string; isDir: boolean; name: string }) => void;
  onOpenInExplorer: (target: { path: string; isDir: boolean; name: string }) => void;
  isRoot: boolean;
}) {
  // Anchor to the cursor; clip to viewport.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });
  useEffect(() => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const W = 200;
    const H = 160;
    setPos({
      left: x + W > winW ? winW - W - 8 : x,
      top: y + H > winH ? winH - H - 8 : y,
    });
  }, [x, y]);

  // Determine the parent dir to create inside: if target is a directory,
  // create inside it; if it's a file, create as sibling.
  const parent = target.isDir
    ? target.path
    : target.path.replace(/[\\/][^\\/]+$/, '');

  void onClose;
  return (
    <div
      data-ctx-menu
      className="fixed z-[300] flex w-52 flex-col overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="border-b border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">
        {isRoot ? 'Raiz do projeto' : <span className="truncate">{target.name}</span>}
      </div>
      <CtxItem icon={<FilePlus size={12} />} label="Novo arquivo" onClick={() => onNewFile(parent)} />
      <CtxItem icon={<FolderPlus size={12} />} label="Nova pasta" onClick={() => onNewFolder(parent)} />
      {target.isDir && (
        <>
          <div className="my-1 mx-2 border-t border-border-subtle" />
          <CtxItem
            icon={<Play size={12} />}
            label="Rodar dev server aqui"
            onClick={() => onStartDevServer(target)}
          />
          <CtxItem
            icon={<ExternalLink size={12} />}
            label="Abrir no Explorer"
            onClick={() => onOpenInExplorer(target)}
          />
        </>
      )}
      {!target.isDir && (
        <>
          <div className="my-1 mx-2 border-t border-border-subtle" />
          <CtxItem
            icon={<ExternalLink size={12} />}
            label="Mostrar no Explorer"
            onClick={() => onOpenInExplorer(target)}
          />
        </>
      )}
      {!isRoot && (
        <>
          <div className="my-1 mx-2 border-t border-border-subtle" />
          <CtxItem
            icon={<Pencil size={12} />}
            label="Renomear"
            shortcut="F2"
            onClick={() => onRename(target)}
          />
          <CtxItem
            icon={<Trash2 size={12} />}
            label={`Apagar ${target.isDir ? 'pasta' : 'arquivo'}`}
            tone="danger"
            onClick={() => onDelete(target)}
          />
        </>
      )}
    </div>
  );
}

function CtxItem({
  icon, label, shortcut, onClick, tone,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--text-secondary)';
  const hover = tone === 'danger' ? 'var(--danger-soft)' : 'var(--bg-hover)';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors"
      style={{ color }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-[9.5px] text-text-muted">{shortcut}</span>}
    </button>
  );
}

// ============================================================================
// Icon picker
// ============================================================================

function iconForEntry(entry: DirEntry, isOpen: boolean) {
  if (entry.isDir) {
    return isOpen
      ? <FolderOpen size={12} className="text-accent" />
      : <Folder size={12} className="text-accent" />;
  }
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const lower = entry.name.toLowerCase();
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile'))
    return <FileCode size={12} className="text-info" />;
  if (lower.startsWith('.env'))
    return <FileType size={12} className="text-warning" />;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'sh'].includes(ext))
    return <FileCode size={12} className="text-info" />;
  if (ext === 'json') return <FileJson size={12} className="text-warning" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(ext))
    return <FileImage size={12} className="text-success" />;
  if (['md', 'mdx', 'txt'].includes(ext))
    return <FileText size={12} className="text-text-tertiary" />;
  return <FileText size={12} className="text-text-muted" />;
}

// Expose a small helper for "Voltz Mais" + button on the header
export { Plus };
