import { useRef } from 'react';
import { Clapperboard, RefreshCw, X as XIcon, ExternalLink } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import type { PaneLeaf } from '@shared/types';

interface Props {
  tabId: string;
  pane: PaneLeaf;
  /** A aba está ativa? O <webview> só é montado quando visível (evita tela preta). */
  visible: boolean;
  onClose?: () => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
}

/** YouTube/Vimeo → URL de embed; demais URLs passam direto. */
function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=0&rel=0`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

export function VideoPane({ tabId, pane, visible, onClose, dragHandleProps }: Props) {
  const updatePane = useWorkspaceStore((s) => s.updatePane);
  const video = pane.video;
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  function changeSource() {
    updatePane(tabId, pane.id, { viewMode: undefined, video: undefined });
  }

  const title = video?.title || (video?.source === 'url' ? video.src : 'Vídeo');

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface pl-2 pr-1.5">
        <div
          {...(dragHandleProps ?? {})}
          className={`flex min-w-0 flex-1 items-center gap-1.5 ${dragHandleProps ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]" style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)', color: 'var(--accent)' }}>
            <Clapperboard size={10} />
          </span>
          <span className="truncate text-[11px] font-semibold text-text-secondary">{title}</span>
        </div>
        <button onClick={changeSource} title="Trocar fonte do vídeo" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
          <RefreshCw size={12} />
        </button>
        {video?.source === 'url' && (
          <button onClick={() => video && void window.api.devServer.openUrl(video.src)} title="Abrir no navegador externo" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <ExternalLink size={12} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Fechar painel" className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger">
            <XIcon size={13} />
          </button>
        )}
      </div>

      {/* Conteúdo */}
      <div className="relative flex-1 overflow-hidden">
        {!video ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Clapperboard size={22} className="text-text-disabled" />
            <p className="text-[12px] text-text-tertiary">Sem fonte de vídeo</p>
          </div>
        ) : video.source === 'file' ? (
          <video
            ref={videoElRef}
            src={`file://${video.src.replace(/\\/g, '/')}`}
            controls
            autoPlay={false}
            className="h-full w-full bg-black"
            onTimeUpdate={(e) => {
              const t = Math.floor((e.target as HTMLVideoElement).currentTime);
              if (t % 5 === 0) updatePane(tabId, pane.id, { video: { ...video, posSeconds: t } });
            }}
          />
        ) : visible ? (
          <webview
            src={toEmbed(video.src)}
            {...({ allowpopups: 'true' } as Record<string, string>)}
            partition="persist:voltz-video"
            style={{ display: 'flex', height: '100%', width: '100%' }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-base text-center">
            <Clapperboard size={20} className="text-text-disabled" />
            <p className="text-[12px] text-text-tertiary">Vídeo pausado — volte para esta aba</p>
          </div>
        )}
      </div>
    </div>
  );
}
