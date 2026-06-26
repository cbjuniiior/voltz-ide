import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CaseSensitive, FileText, Loader2, Regex, WholeWord } from 'lucide-react';
import type { SearchMatchLite } from '@shared/types';
import { useEditorStore } from '@/stores/editor';

interface Props {
  workspaceTabId: string;
  projectRoot: string;
  onClose: () => void;
}

function join(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return root.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}
function dirname(p: string): string {
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function highlight(preview: string, query: string, caseSensitive: boolean, regex: boolean, wholeWord: boolean) {
  let idx = -1;
  let len = query.length;
  if (regex || wholeWord) {
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const body = regex ? query : escaped;
      const pattern = wholeWord ? `\\b(?:${body})\\b` : body;
      const m = new RegExp(pattern, caseSensitive ? '' : 'i').exec(preview);
      if (m) { idx = m.index; len = m[0].length; }
    } catch { /* regex inválida: sem destaque */ }
  } else {
    const hay = caseSensitive ? preview : preview.toLowerCase();
    const q = caseSensitive ? query : query.toLowerCase();
    idx = q ? hay.indexOf(q) : -1;
  }
  if (idx < 0 || len <= 0) return <>{preview}</>;
  return (
    <>
      {preview.slice(0, idx)}
      <mark className="rounded-sm px-0.5" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
        {preview.slice(idx, idx + len)}
      </mark>
      {preview.slice(idx + len)}
    </>
  );
}

export function SearchModal({ workspaceTabId, projectRoot, onClose }: Props) {
  const openFile = useEditorStore((s) => s.openFile);
  const setActive = useEditorStore((s) => s.setActive);
  const requestReveal = useEditorStore((s) => s.requestReveal);

  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<SearchMatchLite[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Busca debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setTruncated(false); setError(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await window.api.files.search(projectRoot, q, { caseSensitive, regex, wholeWord, maxResults: 400 });
      setResults(res.matches);
      setTruncated(res.truncated);
      setError(res.error ?? null);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, caseSensitive, regex, wholeWord, projectRoot]);

  const groups = useMemo(() => {
    const m = new Map<string, SearchMatchLite[]>();
    for (const r of results) {
      const arr = m.get(r.file) ?? [];
      arr.push(r);
      m.set(r.file, arr);
    }
    return [...m.entries()];
  }, [results]);

  async function openResult(rel: string, line: number) {
    const abs = join(projectRoot, rel);
    await openFile(workspaceTabId, projectRoot, abs);
    setActive(workspaceTabId, abs);
    requestReveal(abs, line);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 p-6 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
          {loading ? <Loader2 size={15} className="shrink-0 animate-spin text-text-muted" /> : <Search size={15} className="shrink-0 text-text-muted" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={regex ? 'Buscar com regex…  ex.: function\\s+\\w+' : 'Buscar no projeto…'}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            spellCheck={false}
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            title="Diferenciar maiúsculas/minúsculas"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{
              background: caseSensitive ? 'var(--accent-soft)' : 'transparent',
              color: caseSensitive ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <CaseSensitive size={15} />
          </button>
          <button
            onClick={() => setWholeWord((v) => !v)}
            title="Palavra inteira"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{
              background: wholeWord ? 'var(--accent-soft)' : 'transparent',
              color: wholeWord ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <WholeWord size={15} />
          </button>
          <button
            onClick={() => setRegex((v) => !v)}
            title="Expressão regular"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{
              background: regex ? 'var(--accent-soft)' : 'transparent',
              color: regex ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <Regex size={15} />
          </button>
          <button onClick={onClose} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-center text-[12px] font-medium" style={{ color: 'var(--danger)' }}>{error}</div>
          )}
          {!error && query.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-text-muted">Nenhum resultado</div>
          )}
          {query.trim().length < 2 && (
            <div className="px-4 py-10 text-center text-[12px] text-text-muted">Digite ao menos 2 caracteres</div>
          )}

          {groups.map(([file, matches]) => {
            const dir = dirname(file);
            return (
              <div key={file}>
                <div className="sticky top-0 flex items-center gap-1.5 bg-bg-surface px-3 py-1.5 text-[11px]">
                  <FileText size={12} className="shrink-0 text-text-muted" />
                  <span className="font-semibold text-text-secondary">{basename(file)}</span>
                  {dir && <span className="truncate text-text-muted">{dir}</span>}
                  <span className="ml-auto text-[10px] text-text-muted">{matches.length}</span>
                </div>
                {matches.map((m, i) => (
                  <button
                    key={`${file}:${m.line}:${i}`}
                    onClick={() => void openResult(file, m.line)}
                    className="flex w-full items-baseline gap-2 px-3 py-1 pl-7 text-left transition-colors hover:bg-bg-hover"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-text-muted">{m.line}</span>
                    <span className="truncate font-mono text-[11.5px] text-text-tertiary">
                      {highlight(m.preview.trimStart(), query.trim(), caseSensitive, regex, wholeWord)}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}

          {truncated && (
            <div className="px-4 py-2 text-center text-[10.5px] text-text-muted">
              Mostrando os primeiros resultados — refine a busca.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
