import { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Star, RefreshCw, FolderPlus, Folder, Tag, ChevronDown, ChevronRight,
  Plus, Trash2, Code2, Heart, FolderTree, X, Palette, Pencil,
} from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDevServersStore } from '@/stores/devServers';
import { useSnippetsStore } from '@/stores/snippets';
import { collectLeaves } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';
import { FoldersExplorer } from './FoldersExplorer';
import { ProjectFileTree } from './ProjectFileTree';
import { ProjectEditPopover } from './ProjectEditPopover';
import type { Project, ProjectCustomization } from '@shared/types';

type SideTab = 'favoritos' | 'pastas' | 'snippets';

/** Caminho curto: últimas partes. */
function shortPath(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length <= 3) return norm;
  return '…/' + parts.slice(-3).join('/');
}
function matchSearch(p: Project, c: ProjectCustomization, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  return (c.alias || p.name).toLowerCase().includes(ql) || p.path.toLowerCase().includes(ql);
}

/** Insere texto no terminal ativo. */
function insertInActiveTerminal(text: string) {
  const ws = useWorkspaceStore.getState();
  const tabId = ws.activeTabId;
  if (!tabId) return;
  const tab = ws.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const leaves = collectLeaves(tab.root);
  const pane = leaves.find((l) => l.id === (ws.activePaneByTab[tabId] ?? leaves[0]?.id)) ?? leaves[0];
  if (pane?.terminalId) window.api.pty.write(pane.terminalId, text);
}

export function FavoritesSidebar({ onOpenFile, onCloneRepo }: {
  onOpenFile: (root: string, path: string, name: string) => void;
  onCloneRepo: () => void;
}) {
  const [tab, setTab] = useState<SideTab>('favoritos');
  const [q, setQ] = useState('');

  const projects = useProjectsStore((s) => s.projects);
  const scanning = useProjectsStore((s) => s.scanning);
  const scan = useProjectsStore((s) => s.scan);
  const customs = useProjectCustomStore((s) => s.customs);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const snippets = useSnippetsStore((s) => s.snippets);

  const favCount = useMemo(
    () => projects.filter((p) => selectCustom(customs, p.path).favorite).length,
    [projects, customs],
  );

  async function addRoot() {
    const dir = await window.api.dialog.pickFolder();
    if (!dir || settings.rootFolders.includes(dir)) return;
    const roots = [...settings.rootFolders, dir];
    await updateSettings({ rootFolders: roots });
    void scan(roots);
  }

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      {/* Abas */}
      <div className="flex items-center gap-1 px-2.5 pt-2.5">
        <TabBtn active={tab === 'favoritos'} onClick={() => setTab('favoritos')} icon={<Heart size={12} />} label="Favoritos" count={favCount} />
        <TabBtn active={tab === 'pastas'} onClick={() => setTab('pastas')} icon={<FolderTree size={12} />} label="Pastas" count={projects.length} />
        <TabBtn active={tab === 'snippets'} onClick={() => setTab('snippets')} icon={<Code2 size={12} />} label="Snippets" count={snippets.length} />
        <div className="ml-auto flex items-center gap-0.5">
          {tab !== 'snippets' && (
            <>
              <button onClick={() => void scan(settings.rootFolders)} title="Re-escanear" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
                <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => void addRoot()} title="Adicionar pasta de projetos" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
                <FolderPlus size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Busca (favoritos/pastas) */}
      {tab !== 'snippets' && (
        <div className="px-2.5 pt-2">
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 focus-within:border-accent">
            <Search size={13} className="shrink-0 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted" spellCheck={false} />
            <kbd className="rounded bg-bg-active px-1 py-0.5 font-mono text-[9px] text-text-muted">Ctrl L</kbd>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {tab === 'favoritos' && <FavoritesTab projects={projects} customs={customs} q={q} onAddRoot={addRoot} onOpenFile={onOpenFile} />}
        {tab === 'pastas' && <FoldersExplorer q={q} onOpenFile={onOpenFile} onCloneRepo={onCloneRepo} />}
        {tab === 'snippets' && <SnippetsTab />}
      </div>

      {/* Rodapé */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-border-subtle px-3 py-2 text-[10.5px] text-text-muted">
        <Star size={11} className="text-text-tertiary" />
        <span>{favCount} favoritos</span>
        <span className="text-text-disabled">·</span>
        <span>{projects.length} projetos</span>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
      style={{ background: active ? 'var(--bg-active)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
    >
      {icon}
      {label}
      {count > 0 && <span className="rounded-full bg-bg-base px-1 text-[9px] text-text-muted">{count}</span>}
    </button>
  );
}

function FavoritesTab({ projects, customs, q, onAddRoot, onOpenFile }: { projects: Project[]; customs: Record<string, ProjectCustomization>; q: string; onAddRoot: () => void; onOpenFile: (root: string, path: string, name: string) => void }) {
  const [filter, setFilter] = useState('all'); // 'all' | tag
  const [openTree, setOpenTree] = useState<Record<string, boolean>>({});
  const toggleFavorite = useProjectCustomStore((s) => s.toggleFavorite);
  const openProject = useWorkspaceStore((s) => s.openProjectInNewTab);
  const devByPath = useDevServersStore((s) => s.byPath);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      const c = selectCustom(customs, p.path);
      if (c.favorite) (c.tags ?? []).forEach((t) => set.add(t));
    }
    return [...set].sort();
  }, [projects, customs]);

  const favs = useMemo(() => projects.filter((p) => {
    const c = selectCustom(customs, p.path);
    if (!c.favorite) return false;
    if (!matchSearch(p, c, q)) return false;
    if (filter !== 'all' && !(c.tags ?? []).includes(filter)) return false;
    return true;
  }), [projects, customs, q, filter]);

  if (projects.filter((p) => selectCustom(customs, p.path).favorite).length === 0) {
    return <Empty hint="Marque projetos com a ★ para vê-los aqui" onAddRoot={onAddRoot} showAdd={projects.length === 0} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <Chip label="Tudo" active={filter === 'all'} onClick={() => setFilter('all')} />
          {allTags.map((t) => <Chip key={t} label={`#${t}`} active={filter === t} onClick={() => setFilter(t)} />)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {favs.map((p) => {
          const isOpen = !!openTree[p.path];
          return (
            <div key={p.id} className={isOpen ? 'overflow-hidden rounded-xl border border-border-subtle bg-bg-base/40' : ''}>
              <ProjectRow
                project={p}
                custom={selectCustom(customs, p.path)}
                devRunning={devByPath[p.path]?.phase === 'running'}
                onOpen={() => openProject(p.name, p.path)}
                onToggleFav={() => void toggleFavorite(p.path)}
                expanded={isOpen}
                onToggleExpand={() => setOpenTree((o) => ({ ...o, [p.path]: !o[p.path] }))}
              />
              {isOpen && (
                <div className="pb-1">
                  <ProjectFileTree root={p.path} onOpenFile={onOpenFile} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SnippetsTab() {
  const snippets = useSnippetsStore((s) => s.snippets);
  const add = useSnippetsStore((s) => s.add);
  const remove = useSnippetsStore((s) => s.remove);
  const update = useSnippetsStore((s) => s.update);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  function save() {
    if (!body.trim()) return;
    void add(title || body.slice(0, 24), body);
    setTitle(''); setBody(''); setAdding(false);
  }
  function startEdit(s: { id: string; title: string; body: string }) {
    setAdding(false);
    setEditingId(s.id); setEditTitle(s.title); setEditBody(s.body);
  }
  function saveEdit() {
    if (!editingId || !editBody.trim()) return;
    void update(editingId, { title: editTitle.trim() || editBody.slice(0, 24), body: editBody });
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-2 px-0.5">
      <button onClick={() => { setAdding((v) => !v); setEditingId(null); }} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-default py-2 text-[12px] font-medium text-text-tertiary transition-colors hover:border-accent hover:text-accent">
        <Plus size={14} /> Novo snippet
      </button>
      {adding && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-base p-2">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="rounded-md bg-bg-surface px-2 py-1 text-[12px] text-text-primary outline-none placeholder:text-text-muted" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comando ou texto…" rows={3} className="resize-none rounded-md bg-bg-surface px-2 py-1 font-mono text-[11.5px] text-text-primary outline-none placeholder:text-text-muted" />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setAdding(false)} className="rounded-md px-2.5 py-1 text-[11.5px] text-text-muted hover:text-text-secondary">Cancelar</button>
            <button onClick={save} disabled={!body.trim()} className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Salvar</button>
          </div>
        </div>
      )}
      {snippets.length === 0 && !adding && (
        <p className="px-2 py-4 text-center text-[11.5px] text-text-muted">Salve comandos que você usa direto. Clique pra inserir no terminal ativo.</p>
      )}
      {snippets.map((s) => editingId === s.id ? (
        <div key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-base p-2" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)' }}>
          <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título" className="rounded-md bg-bg-surface px-2 py-1 text-[12px] text-text-primary outline-none placeholder:text-text-muted" />
          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} placeholder="Comando ou texto…" rows={3} className="resize-none rounded-md bg-bg-surface px-2 py-1 font-mono text-[11.5px] text-text-primary outline-none placeholder:text-text-muted" />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setEditingId(null)} className="rounded-md px-2.5 py-1 text-[11.5px] text-text-muted hover:text-text-secondary">Cancelar</button>
            <button onClick={saveEdit} disabled={!editBody.trim()} className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Salvar</button>
          </div>
        </div>
      ) : (
        <div key={s.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-hover">
          <button onClick={() => insertInActiveTerminal(s.body)} title="Inserir no terminal ativo" className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span className="truncate text-[12px] font-medium text-text-secondary group-hover:text-text-primary">{s.title}</span>
            <span className="truncate font-mono text-[10px] text-text-muted">{s.body}</span>
          </button>
          <button onClick={() => startEdit(s)} title="Editar snippet" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-disabled opacity-0 transition-all hover:bg-bg-active hover:text-text-primary group-hover:opacity-100">
            <Pencil size={12} />
          </button>
          <button onClick={() => void remove(s.id)} title="Remover" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-disabled opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Empty({ hint, onAddRoot, showAdd }: { hint: string; onAddRoot: () => void; showAdd: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
      <Folder size={22} className="text-text-disabled" />
      <p className="text-[12px] text-text-tertiary">{hint}</p>
      {showAdd && (
        <button onClick={onAddRoot} className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
          <FolderPlus size={13} /> Adicionar pasta
        </button>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-colors" style={{ background: active ? 'var(--accent)' : 'var(--bg-base)', color: active ? 'var(--accent-fg)' : 'var(--text-tertiary)', border: `1px solid ${active ? 'transparent' : 'var(--border-subtle)'}` }}>
      {label}
    </button>
  );
}

function ProjectRow({ project, custom, devRunning, onOpen, onToggleFav, expanded, onToggleExpand }: {
  project: Project; custom: ProjectCustomization; devRunning: boolean; onOpen: () => void; onToggleFav: () => void;
  expanded?: boolean; onToggleExpand?: () => void;
}) {
  const setDraggingProject = useWorkspaceStore((s) => s.setDraggingProject);
  const auto = getProjectColor(project.name);
  const accent = custom.color || auto.border;
  const name = custom.alias || project.name;
  const tags = custom.tags ?? [];
  return (
    <div
      onClick={onOpen}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/voltz-project', JSON.stringify({ path: project.path, name: project.name }));
        e.dataTransfer.effectAllowed = 'copy';
        setDraggingProject({ path: project.path, name: project.name });
      }}
      onDragEnd={() => setDraggingProject(null)}
      title={`${project.path}\n• clique para abrir em nova aba\n• seta para ver os arquivos\n• arraste para um slot ou para a borda de um terminal`}
      className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-bg-hover active:cursor-grabbing"
    >
      {onToggleExpand && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          title={expanded ? 'Ocultar arquivos' : 'Ver arquivos da pasta'}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-secondary"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
      <span className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold" style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)`, color: accent, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)` }}>
        {custom.emoji || name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-text-secondary group-hover:text-text-primary">{name}</span>
          {devRunning && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 5px var(--success)' }} />}
        </div>
        <span className="truncate text-[10.5px] text-text-muted">{shortPath(project.path)}</span>
      </div>
      {tags[0] && (
        <span className="hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-text-muted group-hover:hidden sm:flex" style={{ background: 'var(--bg-active)' }}>
          <Tag size={8} />{tags[0]}
        </span>
      )}
      <span className="hidden items-center gap-0.5 group-hover:flex">
        <EditButton projectPath={project.path} projectName={project.name} />
        <TagButton projectPath={project.path} tags={tags} />
      </span>
      <button onClick={(e) => { e.stopPropagation(); onToggleFav(); }} title={custom.favorite ? 'Remover dos favoritos' : 'Favoritar'} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all" style={{ color: custom.favorite ? 'var(--warning)' : 'var(--text-disabled)', opacity: custom.favorite ? 1 : 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = custom.favorite ? '1' : '0'; }}>
        <Star size={14} fill={custom.favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

/** Botão + popover para editar apelido, cor e emoji do projeto. */
function EditButton({ projectPath, projectName }: { projectPath: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Personalizar (nome, cor, emoji)"
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
      >
        <Palette size={13} />
      </button>
      {open && btnRef.current && createPortal(
        <ProjectEditPopover projectPath={projectPath} projectName={projectName} anchor={btnRef.current} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
}

/** Botão + popover para gerenciar as tags de um projeto. */
function TagButton({ projectPath, tags }: { projectPath: string; tags: string[] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const update = useProjectCustomStore((s) => s.update);
  const customs = useProjectCustomStore((s) => s.customs);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(customs)) (c.tags ?? []).forEach((t) => set.add(t));
    return [...set].filter((t) => !tags.includes(t)).sort();
  }, [customs, tags]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    void update(projectPath, { tags: [...tags, tag] });
    setInput('');
  }
  function removeTag(t: string) {
    void update(projectPath, { tags: tags.filter((x) => x !== t) });
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title="Tags do projeto" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary">
        <Tag size={13} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} className="cmd-enter absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border-default bg-bg-overlay p-2.5 shadow-lg">
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.length === 0 && <span className="text-[10.5px] text-text-muted">Sem tags ainda</span>}
            {tags.map((t) => (
              <button key={t} onClick={() => removeTag(t)} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} title="Remover">
                #{t} <X size={9} />
              </button>
            ))}
          </div>
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag(input); }} placeholder="Nova tag + Enter" className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-[11.5px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted" />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((t) => (
                <button key={t} onClick={() => addTag(t)} className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary transition-colors hover:border-accent hover:text-accent">
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
