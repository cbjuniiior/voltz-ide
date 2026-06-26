import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DirEntry } from '@shared/types';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { useWorkspaceStore } from '@/stores/workspace';
import { toast } from '@/stores/toasts';
import { Row, CtxMenu, CreateRow, baseName, parentOf, type Ctx, type Creating } from './FoldersExplorer';

/**
 * Árvore de arquivos embutida, escopada a UM projeto — reusa o `Row` do
 * FoldersExplorer (abrir/criar/apagar/menu de contexto), com estado próprio.
 * Usada ao expandir um favorito para navegar o conteúdo da pasta.
 */
export function ProjectFileTree({ root, onOpenFile }: {
  root: string;
  onOpenFile: (root: string, path: string, name: string) => void;
}) {
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
  const [loading, setLoading] = useState(true);

  async function loadDir(dir: string) {
    try { const list = await window.api.projects.readDir(dir); setEntries((prev) => new Map(prev).set(dir, list)); }
    catch { /* sumiu */ }
  }
  async function toggle(dir: string) {
    if (expanded.has(dir)) setExpanded((p) => { const n = new Set(p); n.delete(dir); return n; });
    else { if (!entries.has(dir)) await loadDir(dir); setExpanded((p) => new Set(p).add(dir)); }
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
  async function del(rt: string, t: { path: string; isDir: boolean; name: string }) {
    const ok = window.confirm(t.isDir ? `Apagar a pasta "${t.name}" e tudo dentro? Não dá pra desfazer.` : `Apagar "${t.name}"? Não dá pra desfazer.`);
    if (!ok) return;
    const res = await window.api.files.delete(rt, t.path);
    if (!res.ok) { toast.error('Não consegui apagar', res.error); return; }
    await loadDir(parentOf(t.path));
    toast.info('Apagado', t.name);
  }
  function startCreate(parent: string, kind: 'file' | 'directory') {
    setCreating({ root, parent, kind });
    setCreateName('');
    setExpanded((p) => new Set(p).add(parent));
    if (!entries.has(parent)) void loadDir(parent);
  }

  useEffect(() => { setLoading(true); void (async () => { await loadDir(root); setLoading(false); })(); }, [root]);

  useEffect(() => {
    if (!ctx) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-ctx]')) setCtx(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ctx]);

  const children = entries.get(root) ?? [];

  return (
    <div className="py-0.5">
      {loading ? (
        <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-text-muted">
          <Loader2 size={12} className="animate-spin" /> carregando…
        </div>
      ) : children.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-text-muted">Pasta vazia</div>
      ) : (
        children.map((child) => (
          <Row
            key={child.path}
            root={root}
            entry={child}
            depth={1}
            filter=""
            entries={entries}
            expanded={expanded}
            creating={creating}
            createName={createName}
            projectPaths={projectPaths}
            customs={customs}
            searching={false}
            onToggle={toggle}
            onOpenFile={onOpenFile}
            onOpenTerminal={(p) => openProjectInNewTab(baseName(p), p)}
            onToggleFav={(p) => void toggleFavorite(p)}
            onDragProject={setDraggingProject}
            onCtx={(e, t) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, root, target: t, isRoot: false, isProject: projectPaths.has(t.path), isFav: selectCustom(customs, t.path).favorite }); }}
            onCreateChange={setCreateName}
            onCreateConfirm={() => creating && void create(creating, createName)}
            onCreateCancel={() => { setCreating(null); setCreateName(''); }}
          />
        ))
      )}
      {creating && creating.parent === root && (
        <CreateRow depth={1} kind={creating.kind} value={createName} onChange={setCreateName} onConfirm={() => void create(creating, createName)} onCancel={() => { setCreating(null); setCreateName(''); }} />
      )}
      {ctx && (
        <CtxMenu
          ctx={ctx}
          onClose={() => setCtx(null)}
          onNewFile={() => { startCreate(ctx.target.isDir ? ctx.target.path : parentOf(ctx.target.path), 'file'); setCtx(null); }}
          onNewFolder={() => { startCreate(ctx.target.isDir ? ctx.target.path : parentOf(ctx.target.path), 'directory'); setCtx(null); }}
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
