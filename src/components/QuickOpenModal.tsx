import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { fuzzyMatch, highlightMatches } from '@/lib/fuzzy';
import { useEditorStore } from '@/stores/editor';

interface Props {
  workspaceTabId: string;
  projectRoot: string;
  onClose: () => void;
}

interface RankedItem {
  relativePath: string;
  filename: string;
  fileScore: number;
  filenamePositions: number[];
  pathScore: number;
  pathPositions: number[];
}

const MAX_RESULTS = 80;

export function QuickOpenModal({ workspaceTabId, projectRoot, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openFile = useEditorStore((s) => s.openFile);

  // Initial load of all files in the project.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await window.api.files.listAll(projectRoot);
      if (!cancelled) {
        setFiles(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectRoot]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const ranked = useMemo<RankedItem[]>(() => {
    const q = query.trim();
    const items: RankedItem[] = [];
    if (!q) {
      // Empty query → first MAX_RESULTS files by path order (kept stable so user
      // sees something the moment they hit Ctrl+P, even with no input).
      for (let i = 0; i < Math.min(files.length, MAX_RESULTS); i++) {
        const rel = files[i];
        const filename = rel.split('/').pop() ?? rel;
        items.push({
          relativePath: rel,
          filename,
          fileScore: 0,
          filenamePositions: [],
          pathScore: 0,
          pathPositions: [],
        });
      }
      return items;
    }
    for (const rel of files) {
      const filename = rel.split('/').pop() ?? rel;
      const fileMatch = fuzzyMatch(filename, q);
      const pathMatch = fileMatch ? null : fuzzyMatch(rel, q);
      if (!fileMatch && !pathMatch) continue;
      items.push({
        relativePath: rel,
        filename,
        fileScore: fileMatch?.score ?? 0,
        filenamePositions: fileMatch?.positions ?? [],
        pathScore: pathMatch?.score ?? 0,
        pathPositions: pathMatch?.positions ?? [],
      });
    }
    // Filename matches win over path-only matches.
    items.sort((a, b) => {
      const aBest = Math.max(a.fileScore * 2, a.pathScore);
      const bBest = Math.max(b.fileScore * 2, b.pathScore);
      return bBest - aBest;
    });
    return items.slice(0, MAX_RESULTS);
  }, [files, query]);

  // Clamp selection when results change
  useEffect(() => {
    if (selectedIdx >= ranked.length) setSelectedIdx(0);
  }, [ranked.length, selectedIdx]);

  // Scroll the selected row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  function open(idx: number) {
    const item = ranked[idx];
    if (!item) return;
    const sep = projectRoot.includes('\\') ? '\\' : '/';
    const absPath = `${projectRoot.replace(/[\\/]+$/, '')}${sep}${item.relativePath.replace(/\//g, sep)}`;
    void openFile(workspaceTabId, projectRoot, absPath);
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, ranked.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(selectedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-black/30 p-6 pt-[18vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="cmd-enter w-full max-w-2xl overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
          <Search size={14} className="text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar arquivo no projeto…"
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <span className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[9.5px] text-text-muted">
            {loading ? '…' : files.length}
          </span>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary" aria-label="Fechar">
            <X size={12} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {ranked.length === 0 && !loading && (
            <div className="px-3 py-6 text-center text-[11px] text-text-muted">
              {query ? 'Nada encontrado.' : 'Nenhum arquivo no projeto.'}
            </div>
          )}
          {loading && (
            <div className="px-3 py-6 text-center text-[11px] text-text-muted">
              Indexando arquivos…
            </div>
          )}
          {ranked.map((item, idx) => {
            const isSel = idx === selectedIdx;
            const dir = item.relativePath.includes('/')
              ? item.relativePath.slice(0, item.relativePath.lastIndexOf('/'))
              : '';
            return (
              <button
                key={item.relativePath}
                data-idx={idx}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => open(idx)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
                style={{ background: isSel ? 'var(--bg-active)' : 'transparent' }}
              >
                <FileText size={12} className="shrink-0 text-text-muted" />
                <span className="truncate text-[12.5px] text-text-primary">
                  {item.filenamePositions.length > 0
                    ? highlightMatches(item.filename, item.filenamePositions)
                    : item.filename}
                </span>
                {dir && (
                  <span className="ml-auto truncate text-[10.5px] text-text-muted" title={dir} style={{ maxWidth: '55%' }}>
                    {item.pathPositions.length > 0
                      ? highlightMatches(dir, item.pathPositions.filter((p) => p < dir.length))
                      : dir}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5 text-[9.5px] text-text-muted">
          <span>
            <kbd className="rounded bg-bg-active px-1">↑↓</kbd> navegar · <kbd className="rounded bg-bg-active px-1">Enter</kbd> abrir · <kbd className="rounded bg-bg-active px-1">Esc</kbd> cancelar
          </span>
          <span>{ranked.length} resultado{ranked.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
