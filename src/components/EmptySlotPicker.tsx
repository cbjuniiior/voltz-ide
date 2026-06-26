import { useState } from 'react';
import { TerminalSquare, Globe, Clapperboard, Sparkles, FolderOpen, ArrowLeft } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import type { PaneLeaf } from '@shared/types';

interface Props {
  tabId: string;
  pane: PaneLeaf;
}

/** Painel "slot vazio": escolher o tipo de conteúdo (Terminal / Navegador / Vídeo). */
export function EmptySlotPicker({ tabId, pane }: Props) {
  const updatePane = useWorkspaceStore((s) => s.updatePane);
  const draggingPaneId = useWorkspaceStore((s) => s.draggingPaneId);
  const swapPanes = useWorkspaceStore((s) => s.swapPanes);
  const [videoForm, setVideoForm] = useState(false);
  const [url, setUrl] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const canDrop = !!draggingPaneId && draggingPaneId !== pane.id;

  function pickTerminal() { updatePane(tabId, pane.id, { viewMode: 'terminal' }); }
  function pickBrowser() { updatePane(tabId, pane.id, { viewMode: 'browser' }); }

  function confirmVideoUrl() {
    const src = url.trim();
    if (!src) return;
    updatePane(tabId, pane.id, { viewMode: 'video', video: { source: 'url', src } });
  }

  async function pickVideoFile() {
    const pick = window.api.dialog.pickFile;
    if (!pick) return;
    const file = await pick({ filters: [{ name: 'Vídeo', extensions: ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogg'] }] });
    if (!file) return;
    updatePane(tabId, pane.id, { viewMode: 'video', video: { source: 'file', src: file, title: file.split(/[\\/]/).pop() } });
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-bg-base p-6 transition-all"
      onDragOver={(e) => {
        if (canDrop || e.dataTransfer.types.includes('application/voltz-project')) { e.preventDefault(); setDropActive(true); }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        const raw = e.dataTransfer.getData('application/voltz-project');
        if (raw) {
          try {
            const p = JSON.parse(raw) as { path: string; name: string };
            updatePane(tabId, pane.id, { projectPath: p.path, projectName: p.name, title: p.name, viewMode: 'terminal' });
          } catch { /* ignore */ }
          return;
        }
        if (canDrop) swapPanes(tabId, draggingPaneId!, pane.id);
      }}
      style={dropActive ? { boxShadow: 'inset 0 0 0 2px var(--accent)', background: 'var(--accent-soft)' } : undefined}
    >
      <div
        className="surface-card flex w-full max-w-md flex-col items-center gap-5 p-7 welcome-fade transition-transform"
        style={dropActive ? { transform: 'scale(1.02)', borderColor: 'var(--accent)' } : undefined}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-soft)' }}>
            <Sparkles size={22} className="text-accent" />
          </span>
          <p className="text-[15px] font-bold text-text-primary">Slot vazio</p>
          <p className="text-[12px] text-text-muted">Arraste uma aba ou um projeto aqui, ou escolha um tipo abaixo</p>
        </div>

        {!videoForm ? (
          <div className="grid w-full grid-cols-3 gap-2.5">
            <TypeCard icon={<TerminalSquare size={20} />} label="Terminal" onClick={pickTerminal} />
            <TypeCard icon={<Globe size={20} />} label="Navegador" onClick={pickBrowser} />
            <TypeCard icon={<Clapperboard size={20} />} label="Vídeo" onClick={() => setVideoForm(true)} />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 focus-within:border-accent">
              <Clapperboard size={14} className="shrink-0 text-text-muted" />
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmVideoUrl(); }}
                placeholder="Cole um link do YouTube ou uma URL de vídeo…"
                className="flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmVideoUrl}
                disabled={!url.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition-all disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Abrir vídeo
              </button>
              <button
                onClick={() => void pickVideoFile()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-default"
                title="Escolher um arquivo de vídeo local"
              >
                <FolderOpen size={14} /> Arquivo
              </button>
            </div>
            <button
              onClick={() => setVideoForm(false)}
              className="flex items-center justify-center gap-1.5 text-[11.5px] text-text-muted transition-colors hover:text-text-secondary"
            >
              <ArrowLeft size={12} /> Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-border-subtle bg-bg-base px-2 py-4 text-text-tertiary transition-all hover:border-accent hover:text-accent"
      style={{ }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-base)'; }}
    >
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}
