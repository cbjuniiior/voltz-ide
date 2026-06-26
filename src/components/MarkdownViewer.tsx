import { useEffect, useState } from 'react';
import { X, FileText, Image as ImageIcon, ExternalLink, Loader2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|apng)$/i;

/** Visualizador de arquivo: imagens/SVG, markdown bonito, ou texto/código. */
export function MarkdownViewer({ root, path, name, onClose }: { root: string; path: string; name: string; onClose: () => void }) {
  const isImage = IMAGE_RE.test(name);
  const isMd = /\.(md|mdx|markdown)$/i.test(name);

  const [content, setContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');

  useEffect(() => {
    let alive = true;
    setContent(null); setImageUrl(null); setError(null); setDims(null); setZoom('fit');
    if (isImage) {
      window.api.files.readDataUrl(root, path).then((res) => {
        if (!alive) return;
        if (res.ok) setImageUrl(res.dataUrl);
        else setError(res.error);
      }).catch((e) => { if (alive) setError(String(e)); });
    } else {
      window.api.files.read(root, path).then((res) => {
        if (!alive) return;
        if (res.ok) setContent(res.content);
        else setError(res.binary ? 'Arquivo binário — não dá para exibir aqui.' : res.error);
      }).catch((e) => { if (alive) setError(String(e)); });
    }
    return () => { alive = false; };
  }, [root, path, isImage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (isImage && (e.key === '+' || e.key === '=')) setZoom((z) => Math.min(8, (z === 'fit' ? 1 : z) * 1.25));
      else if (isImage && e.key === '-') setZoom((z) => Math.max(0.1, (z === 'fit' ? 1 : z) * 0.8));
      else if (isImage && e.key === '0') setZoom('fit');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isImage]);

  function onWheel(e: React.WheelEvent) {
    if (!isImage || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => {
      const cur = z === 'fit' ? 1 : z;
      return Math.min(8, Math.max(0.1, cur * (e.deltaY < 0 ? 1.12 : 0.89)));
    });
  }

  const wide = isImage;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6" onClick={onClose}>
      <div
        className={`cmd-enter flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-lg ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-3">
          {isImage ? <ImageIcon size={16} className="shrink-0 text-accent" /> : <FileText size={16} className="shrink-0 text-accent" />}
          <span className="truncate text-[13.5px] font-semibold text-text-primary" title={path}>{name}</span>
          {isImage && dims && (
            <span className="shrink-0 font-mono text-[11px] text-text-muted">{dims.w}×{dims.h}</span>
          )}

          {isImage && (
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={() => setZoom((z) => Math.max(0.1, (z === 'fit' ? 1 : z) * 0.8))} title="Diminuir (−)" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><ZoomOut size={14} /></button>
              <button onClick={() => setZoom('fit')} title="Ajustar à janela (0)" className="flex h-7 items-center justify-center rounded-md px-1.5 font-mono text-[11px] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary" style={{ minWidth: 48 }}>
                {zoom === 'fit' ? 'Ajustar' : `${Math.round(zoom * 100)}%`}
              </button>
              <button onClick={() => setZoom((z) => Math.min(8, (z === 'fit' ? 1 : z) * 1.25))} title="Aumentar (+)" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><ZoomIn size={14} /></button>
              <button onClick={() => setZoom('fit')} title="Ajustar à janela" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><Maximize size={14} /></button>
              <span className="mx-1 h-4 w-px bg-border-subtle" />
            </div>
          )}

          <button onClick={() => void window.api.system.openInExplorer(path)} title="Mostrar no Explorer" className={`flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary ${isImage ? '' : 'ml-auto'}`}><ExternalLink size={15} /></button>
          <button onClick={onClose} title="Fechar (Esc)" className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><X size={16} /></button>
        </div>

        {/* Body */}
        {isImage ? (
          <div
            onWheel={onWheel}
            onClick={() => setZoom((z) => (z === 'fit' ? 1 : 'fit'))}
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
            style={{
              cursor: zoom === 'fit' ? 'zoom-in' : 'zoom-out',
              backgroundColor: 'var(--bg-base)',
              backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.035) 75%), linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.035) 75%)',
              backgroundSize: '22px 22px',
              backgroundPosition: '0 0, 11px 11px',
            }}
          >
            {imageUrl === null && !error && (
              <div className="flex items-center gap-2 text-text-muted"><Loader2 size={16} className="animate-spin" /> carregando…</div>
            )}
            {error && <p className="px-4 text-center text-[13px] text-danger">{error}</p>}
            {imageUrl && (
              <img
                src={imageUrl}
                alt={name}
                onClick={(e) => e.stopPropagation()}
                onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                draggable={false}
                className={zoom === 'fit' ? 'max-h-full max-w-full object-contain' : ''}
                style={zoom === 'fit'
                  ? { imageRendering: 'auto' }
                  : { width: dims ? dims.w * zoom : 'auto', height: dims ? dims.h * zoom : 'auto', maxWidth: 'none', cursor: 'zoom-out' }}
              />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {content === null && !error && (
              <div className="flex items-center justify-center gap-2 py-12 text-text-muted"><Loader2 size={16} className="animate-spin" /> carregando…</div>
            )}
            {error && <p className="py-12 text-center text-[13px] text-danger">{error}</p>}
            {content !== null && (
              isMd
                ? <div className="md-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
                : <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg-base p-4 font-mono text-[12.5px] leading-relaxed text-text-secondary">{content}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
