import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, FileText, FileCode, FileJson,
  FileType, FileImage, FilePlus, FolderPlus, TerminalSquare, Trash2, Pencil,
  ExternalLink, GitBranch, FolderSearch, Star, MoreHorizontal,
} from 'lucide-react';
import type { DirEntry, ProjectCustomization } from '@shared/types';
import { useSettingsStore } from '@/stores/settings';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { useWorkspaceStore } from '@/stores/workspace';
import { toast } from '@/stores/toasts';

export function baseName(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean).pop() || p;
}
export function parentOf(p: string): string {
  return p.replace(/[\\/][^\\/]+$/, '');
}

/** Casa o nó se o nome dele (ou de algum descendente já carregado) contém o termo. */
function subtreeMatches(entry: { name: string; path: string; isDir: boolean }, filter: string, entriesMap: Map<string, DirEntry[]>): boolean {
  if (entry.name.toLowerCase().includes(filter)) return true;
  if (!entry.isDir) return false;
  const children = entriesMap.get(entry.path);
  return children ? children.some((c) => subtreeMatches(c, filter, entriesMap)) : false;
}

function iconFor(entry: { isDir: boolean; name: string }, isOpen: boolean) {
  if (entry.isDir) return isOpen ? <FolderOpen size={15} className="text-accent" /> : <Folder size={15} className="text-accent" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const lower = entry.name.toLowerCase();
  if (lower === 'dockerfile') return <FileCode size={15} className="text-info" />;
  if (lower.startsWith('.env')) return <FileType size={15} className="text-warning" />;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'sh'].includes(ext)) return <FileCode size={15} className="text-info" />;
  if (ext === 'json') return <FileJson size={15} className="text-warning" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(ext)) return <FileImage size={15} className="text-success" />;
  if (['md', 'mdx', 'txt'].includes(ext)) return <FileText size={15} className="text-text-secondary" />;
  return <FileText size={15} className="text-text-muted" />;
}

/** Linhas-guia de aninhamento (estilo VS Code): uma vertical por nível ancestral,
 *  desenhadas como background pra cobrir a altura toda da linha (contínuas). */
function indentGuides(depth: number): React.CSSProperties {
  if (depth <= 0) return {};
  const c = 'var(--border-subtle)';
  return {
    backgroundImage: Array.from({ length: depth }, () => `linear-gradient(${c}, ${c})`).join(', '),
    backgroundPosition: Array.from({ length: depth }, (_, i) => `${8 + i * 14}px 0`).join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: Array.from({ length: depth }, () => '1px 100%').join(', '),
  };
}

export interface Creating { root: string; parent: string; kind: 'file' | 'directory' }
export interface Ctx { x: number; y: number; root: string; target: { path: string; isDir: boolean; name: string }; isRoot: boolean; isProject: boolean; isFav: boolean }

export function FoldersExplorer({ q, onOpenFile, onCloneRepo }: {
  q: string;
  onOpenFile: (root: string, path: string, name: string) => void;
  onCloneRepo: () => void;
}) {
  const rootFolders = useSettingsStore((s) => s.settings.rootFolders);
  const updateSettings = useSettingsStore((s) => s.update);
  const scan = useProjectsStore((s) => s.scan);
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const toggleFavorite = useProjectCustomStore((s) => s.toggleFavorite);
  const projectPaths = useMemo(() => new Set(projects.map((p) => p.path)), [projects]);
  const openProjectInNewTab = useWorkspaceStore((s) => s.openProjectInNewTab);
  const setDraggingProject = useWorkspaceStore((s) => s.setDraggingProject);

  const [entries, setEntries] = useState<Map<string, DirEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [createName, setCreateName] = useState('');

  async function loadDir(dir: string) {
    try {
      const list = await window.api.projects.readDir(dir);
      setEntries((prev) => new Map(prev).set(dir, list));
    } catch { /* dir sumiu */ }
  }
  async function toggle(dir: string) {
    if (expanded.has(dir)) setExpanded((p) => { const n = new Set(p); n.delete(dir); return n; });
    else { if (!entries.has(dir)) await loadDir(dir); setExpanded((p) => new Set(p).add(dir)); }
  }
  async function addRoot() {
    const dir = await window.api.dialog.pickFolder();
    if (!dir || rootFolders.includes(dir)) return;
    const roots = [...rootFolders, dir];
    await updateSettings({ rootFolders: roots });
    void scan(roots);
  }
  async function create(c: Creating, name: string) {
    const n = name.trim();
    if (!n) { setCreating(null); return; }
    const target = `${c.parent.replace(/[\\/]+$/, '')}/${n}`;
    const res = await window.api.files.create(c.root, target, c.kind);
    if (!res.ok) { toast.error('Não consegui criar', res.error); return; }
    setExpanded((p) => new Set(p).add(c.parent));
    await loadDir(c.parent);
    setCreating(null); setCreateName('');
    if (c.kind === 'file') {
      const made = (await window.api.projects.readDir(c.parent)).find((e) => e.name === n);
      if (made) onOpenFile(c.root, made.path, made.name);
    }
  }
  async function del(root: string, t: { path: string; isDir: boolean; name: string }) {
    const ok = window.confirm(t.isDir ? `Apagar a pasta "${t.name}" e tudo dentro? Não dá pra desfazer.` : `Apagar "${t.name}"? Não dá pra desfazer.`);
    if (!ok) return;
    const res = await window.api.files.delete(root, t.path);
    if (!res.ok) { toast.error('Não consegui apagar', res.error); return; }
    await loadDir(parentOf(t.path));
    toast.info('Apagado', t.name);
  }
  function startCreate(root: string, parent: string, kind: 'file' | 'directory') {
    setCreating({ root, parent, kind });
    setCreateName('');
    setExpanded((p) => new Set(p).add(parent));
    if (!entries.has(parent)) void loadDir(parent);
  }

  useEffect(() => {
    if (!ctx) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-ctx]')) setCtx(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ctx]);

  // Persiste e restaura as pastas abertas entre sessões.
  const persistGuard = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await window.api.store.get<string[]>('foldersExpanded');
      if (alive && saved && saved.length) {
        const loaded = new Map<string, DirEntry[]>();
        await Promise.all(saved.map(async (d) => { try { loaded.set(d, await window.api.projects.readDir(d)); } catch { /* sumiu */ } }));
        if (alive) {
          setEntries((prev) => { const m = new Map(prev); for (const [k, v] of loaded) m.set(k, v); return m; });
          setExpanded(new Set(saved.filter((d) => loaded.has(d))));
        }
      }
      persistGuard.current = true;
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (persistGuard.current) void window.api.store.set('foldersExpanded', [...expanded]);
  }, [expanded]);

  const ql = q.trim().toLowerCase();
  const searching = ql.length > 0;

  // Ao buscar, carrega os filhos das raízes para que os projetos fiquem pesquisáveis.
  const wasSearching = useRef(false);
  useEffect(() => {
    if (searching && !wasSearching.current) {
      rootFolders.forEach((root) => { if (!entries.has(root)) void loadDir(root); });
    }
    wasSearching.current = searching;
  }, [searching, rootFolders, entries]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de ações */}
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <button onClick={() => void addRoot()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent">
          <FolderPlus size={14} /> Pasta raiz
        </button>
        <button onClick={onCloneRepo} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent">
          <GitBranch size={14} /> Clonar repo
        </button>
      </div>

      {/* Árvore */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rootFolders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <FolderSearch size={22} className="text-text-disabled" />
            <p className="text-[12px] text-text-tertiary">Nenhuma pasta de projetos</p>
            <button onClick={() => void addRoot()} className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              <FolderPlus size={13} /> Adicionar pasta
            </button>
          </div>
        ) : (
          rootFolders.map((root) => (
            <Row
              key={root}
              root={root}
              entry={{ name: baseName(root), path: root, isDir: true }}
              depth={0}
              filter={ql}
              entries={entries}
              expanded={expanded}
              creating={creating}
              createName={createName}
              projectPaths={projectPaths}
              customs={customs}
              searching={searching}
              onToggle={toggle}
              onOpenFile={onOpenFile}
              onOpenTerminal={(p) => openProjectInNewTab(baseName(p), p)}
              onToggleFav={(p) => void toggleFavorite(p)}
              onDragProject={setDraggingProject}
              onCtx={(e, t) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, root, target: t, isRoot: t.path === root, isProject: projectPaths.has(t.path), isFav: selectCustom(customs, t.path).favorite }); }}
              onCreateChange={setCreateName}
              onCreateConfirm={() => creating && void create(creating, createName)}
              onCreateCancel={() => { setCreating(null); setCreateName(''); }}
            />
          ))
        )}
      </div>

      {ctx && (
        <CtxMenu
          ctx={ctx}
          onClose={() => setCtx(null)}
          onNewFile={() => { startCreate(ctx.root, ctx.target.isDir ? ctx.target.path : parentOf(ctx.target.path), 'file'); setCtx(null); }}
          onNewFolder={() => { startCreate(ctx.root, ctx.target.isDir ? ctx.target.path : parentOf(ctx.target.path), 'directory'); setCtx(null); }}
          onTerminal={() => { openProjectInNewTab(ctx.target.name, ctx.target.path); setCtx(null); }}
          onOpenFile={() => { onOpenFile(ctx.root, ctx.target.path, ctx.target.name); setCtx(null); }}
          onExplorer={() => { void window.api.system.openInExplorer(ctx.target.path); setCtx(null); }}
          onToggleFav={() => { void toggleFavorite(ctx.target.path); setCtx(null); }}
          onDelete={() => { void del(ctx.root, ctx.target); setCtx(null); }}
        />
      )}
    </div>
  );
}

interface RowProps {
  root: string;
  entry: { name: string; path: string; isDir: boolean };
  depth: number;
  filter: string;
  entries: Map<string, DirEntry[]>;
  expanded: Set<string>;
  creating: Creating | null;
  createName: string;
  projectPaths: Set<string>;
  customs: Record<string, ProjectCustomization>;
  searching: boolean;
  onToggle: (dir: string) => void;
  onOpenFile: (root: string, path: string, name: string) => void;
  onOpenTerminal: (path: string) => void;
  onToggleFav: (path: string) => void;
  onDragProject: (v: { path: string; name: string } | null) => void;
  onCtx: (e: React.MouseEvent, target: { path: string; isDir: boolean; name: string }) => void;
  onCreateChange: (v: string) => void;
  onCreateConfirm: () => void;
  onCreateCancel: () => void;
}

export function Row(p: RowProps) {
  const { entry, depth, entries, expanded, creating } = p;
  const isOpen = p.searching ? entry.isDir : expanded.has(entry.path);
  const children = entries.get(entry.path) ?? [];
  const indent = depth * 14 + 8;
  const isProject = entry.isDir && p.projectPaths.has(entry.path);
  const isFav = isProject && selectCustom(p.customs, entry.path).favorite;
  // Busca: mostra o nó se ele (ou algum descendente carregado) casa com o termo.
  if (p.filter && !subtreeMatches(entry, p.filter, entries)) return null;

  return (
    <div>
      <div
        draggable={entry.isDir}
        onDragStart={entry.isDir ? (e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/voltz-project', JSON.stringify({ path: entry.path, name: entry.name }));
          e.dataTransfer.effectAllowed = 'copy';
          p.onDragProject({ path: entry.path, name: entry.name });
        } : undefined}
        onDragEnd={entry.isDir ? () => p.onDragProject(null) : undefined}
        onClick={() => { if (entry.isDir) p.onToggle(entry.path); else p.onOpenFile(p.root, entry.path, entry.name); }}
        onContextMenu={(e) => p.onCtx(e, { path: entry.path, isDir: entry.isDir, name: entry.name })}
        className="group flex cursor-pointer items-center gap-1.5 py-1 pr-2 text-[12.5px] transition-colors hover:bg-bg-hover active:cursor-grabbing"
        style={{ paddingLeft: indent, ...indentGuides(depth) }}
        title={`${entry.path}${entry.isDir ? '\n• arraste para a área de terminais para abrir aqui' : ''}`}
      >
        {entry.isDir
          ? (isOpen ? <ChevronDown size={13} className="shrink-0 text-text-muted" /> : <ChevronRight size={13} className="shrink-0 text-text-muted" />)
          : <span className="shrink-0" style={{ width: 13 }} />}
        <span className="shrink-0">{iconFor(entry, isOpen)}</span>
        <span className={`flex-1 truncate ${depth === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{entry.name}</span>

        {entry.isDir && (
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            {isProject && (
              <button
                onClick={(e) => { e.stopPropagation(); p.onToggleFav(entry.path); }}
                title={isFav ? 'Remover dos favoritos' : 'Favoritar projeto'}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-bg-active ${isFav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                style={{ color: isFav ? 'var(--warning)' : 'var(--text-muted)' }}
              >
                <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); p.onOpenTerminal(entry.path); }} title="Abrir terminal nesta pasta" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover:opacity-100">
              <TerminalSquare size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); p.onCtx(e, { path: entry.path, isDir: true, name: entry.name }); }} title="Mais ações" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover:opacity-100">
              <MoreHorizontal size={15} />
            </button>
          </div>
        )}
      </div>

      {entry.isDir && isOpen && (
        <>
          {creating && creating.parent === entry.path && (
            <CreateRow
              depth={depth + 1}
              kind={creating.kind}
              value={p.createName}
              onChange={p.onCreateChange}
              onConfirm={p.onCreateConfirm}
              onCancel={p.onCreateCancel}
            />
          )}
          {children.map((child) => (
            <Row {...p} key={child.path} entry={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}

export function CreateRow({ depth, kind, value, onChange, onConfirm, onCancel }: {
  depth: number; kind: 'file' | 'directory'; value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1 pr-2" style={{ paddingLeft: depth * 14 + 8 }}>
      <span className="shrink-0" style={{ width: 13 }} />
      <span className="shrink-0">{kind === 'directory' ? <Folder size={15} className="text-accent" /> : <FileText size={15} className="text-text-tertiary" />}</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onConfirm(); else if (e.key === 'Escape') onCancel(); }}
        onBlur={() => { if (value.trim()) onConfirm(); else onCancel(); }}
        placeholder={kind === 'directory' ? 'pasta nova' : 'arquivo.ext'}
        className="flex-1 rounded border border-accent bg-bg-base px-1.5 py-0.5 text-[12px] text-text-primary outline-none"
      />
    </div>
  );
}

export function CtxMenu({ ctx, onClose, onNewFile, onNewFolder, onTerminal, onOpenFile, onExplorer, onToggleFav, onDelete }: {
  ctx: Ctx; onClose: () => void;
  onNewFile: () => void; onNewFolder: () => void; onTerminal: () => void; onOpenFile: () => void; onExplorer: () => void; onToggleFav: () => void; onDelete: () => void;
}) {
  const left = Math.min(ctx.x, window.innerWidth - 220);
  const top = Math.min(ctx.y, window.innerHeight - 280);
  void onClose;
  return (
    <div data-ctx className="fixed z-[300] flex w-52 flex-col overflow-hidden rounded-xl border border-border-default bg-bg-overlay py-1 shadow-lg" style={{ left, top }}>
      <div className="truncate border-b border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">{ctx.target.name}</div>
      {ctx.target.isDir ? (
        <>
          {ctx.isProject && (
            <>
              <Item icon={<Star size={14} className="text-warning" fill={ctx.isFav ? 'currentColor' : 'none'} />} label={ctx.isFav ? 'Remover dos favoritos' : 'Favoritar projeto'} onClick={onToggleFav} />
              <div className="my-1 mx-2 border-t border-border-subtle" />
            </>
          )}
          <Item icon={<TerminalSquare size={14} />} label="Abrir no terminal" onClick={onTerminal} />
          <Item icon={<FilePlus size={14} />} label="Novo arquivo" onClick={onNewFile} />
          <Item icon={<FolderPlus size={14} />} label="Nova pasta" onClick={onNewFolder} />
          <div className="my-1 mx-2 border-t border-border-subtle" />
          <Item icon={<ExternalLink size={14} />} label="Abrir no Explorer" onClick={onExplorer} />
        </>
      ) : (
        <>
          <Item icon={<Pencil size={14} />} label="Visualizar / editar" onClick={onOpenFile} />
          <Item icon={<ExternalLink size={14} />} label="Mostrar no Explorer" onClick={onExplorer} />
        </>
      )}
      {!ctx.isRoot && (
        <>
          <div className="my-1 mx-2 border-t border-border-subtle" />
          <Item icon={<Trash2 size={14} />} label={`Apagar ${ctx.target.isDir ? 'pasta' : 'arquivo'}`} tone="danger" onClick={onDelete} />
        </>
      )}
    </div>
  );
}

function Item({ icon, label, onClick, tone }: { icon: React.ReactNode; label: string; onClick: () => void; tone?: 'danger' }) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--text-secondary)';
  const hover = tone === 'danger' ? 'var(--danger-soft)' : 'var(--bg-hover)';
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors" style={{ color }} onMouseEnter={(e) => { e.currentTarget.style.background = hover; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <span className="opacity-80">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
