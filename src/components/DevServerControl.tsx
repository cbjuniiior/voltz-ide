import { useState, useRef, useEffect } from 'react';
import { Play, Square, ExternalLink, Loader2, AlertTriangle, ChevronDown, RotateCw } from 'lucide-react';
import { useDevServersStore, selectDevServer } from '@/stores/devServers';
import type { DevServerState } from '@shared/types';

type Variant = 'sidebar' | 'header';

interface Props {
  projectPath: string;
  variant?: Variant;
  accent?: string;
}

const PHASE_LABEL: Record<DevServerState['phase'], string> = {
  idle: 'Iniciar dev server',
  installing: 'Instalando dependências…',
  starting: 'Iniciando dev server…',
  running: 'Dev server em execução',
  error: 'Erro — clique para detalhes',
  stopped: 'Parado — clique para reiniciar',
};

export function DevServerControl({ projectPath, variant = 'sidebar', accent = 'var(--accent)' }: Props) {
  const state = useDevServersStore((s) => selectDevServer(s.byPath, projectPath));
  const start = useDevServersStore((s) => s.start);
  const stop = useDevServersStore((s) => s.stop);
  const restart = useDevServersStore((s) => s.restart);
  const open = useDevServersStore((s) => s.openInBrowser);

  const [logOpen, setLogOpen] = useState(false);
  const [scriptMenuOpen, setScriptMenuOpen] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logOpen) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setLogOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [logOpen]);

  useEffect(() => {
    if (!scriptMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setScriptMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [scriptMenuOpen]);

  async function toggleScriptMenu() {
    if (!scriptMenuOpen) {
      const list = await window.api.devServer.scripts(projectPath);
      setScripts(list);
    }
    setScriptMenuOpen((v) => !v);
  }

  const phase = state?.phase ?? 'idle';
  const url = state?.url ?? null;
  const errorMsg = state?.errorMessage ?? null;
  const recentLog = state?.recentLog ?? [];
  const pm = state?.pm ?? 'npm';

  const isBusy = phase === 'installing' || phase === 'starting';
  const isRunning = phase === 'running';
  const isError = phase === 'error';

  // No header, "Iniciar dev" usa verde (= rodar); na sidebar mantém a cor do projeto.
  const startColor = variant === 'header' ? 'var(--success)' : accent;

  const sizeClasses = variant === 'sidebar'
    ? 'h-6 px-1.5 text-[10px]'
    : 'h-7 px-2.5 text-[11px]';
  const iconSize = variant === 'sidebar' ? 11 : 13;

  return (
    <div ref={wrapperRef} className="relative flex items-center gap-1">
      {(!state || phase === 'idle' || phase === 'stopped') && (
        <div className="relative flex items-stretch rounded-lg border border-border-subtle bg-bg-base transition-colors hover:border-border-default">
          <button
            onClick={(e) => { e.stopPropagation(); void start(projectPath); }}
            title={`${PHASE_LABEL[phase]} (${pm} run dev)`}
            className={`flex items-center gap-1.5 rounded-l-lg font-medium text-text-secondary transition-colors hover:bg-bg-hover ${sizeClasses}`}
          >
            <Play size={iconSize} fill="currentColor" style={{ color: startColor }} />
            {variant === 'header' && <span>Dev</span>}
          </button>
          <span className="w-px self-stretch" style={{ background: 'var(--border-subtle)' }} />
          <button
            onClick={(e) => { e.stopPropagation(); void toggleScriptMenu(); }}
            title="Escolher script (dev / build / test…)"
            className="flex items-center justify-center rounded-r-lg px-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ChevronDown size={iconSize - 1} />
          </button>
          {scriptMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-border-default bg-bg-overlay py-1 shadow-lg">
              <div className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                Rodar script
              </div>
              {scripts.length === 0 && (
                <div className="px-2.5 py-2 text-[11px] text-text-muted">Nenhum script no package.json</div>
              )}
              {scripts.map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); setScriptMenuOpen(false); void start(projectPath, { script: s }); }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  <Play size={10} fill="currentColor" className="shrink-0 opacity-60" />
                  <span className="truncate font-mono">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isBusy && (
        <button
          onClick={(e) => { e.stopPropagation(); setLogOpen((v) => !v); }}
          title={PHASE_LABEL[phase]}
          className={`flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base font-medium text-text-secondary transition-colors hover:bg-bg-hover ${sizeClasses}`}
        >
          <Loader2 size={iconSize} className="animate-spin" style={{ color: 'var(--warning)' }} />
          {variant === 'header' && (
            <span>{phase === 'installing' ? 'Instalando' : 'Iniciando'}</span>
          )}
        </button>
      )}

      {isError && (
        <button
          onClick={(e) => { e.stopPropagation(); setLogOpen((v) => !v); }}
          title={errorMsg || 'Erro'}
          className={`flex items-center gap-1.5 rounded-lg border font-medium transition-colors ${sizeClasses}`}
          style={{
            background: 'var(--bg-base)',
            color: 'var(--danger)',
            borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)',
          }}
        >
          <AlertTriangle size={iconSize} />
          {variant === 'header' && <span>Erro</span>}
        </button>
      )}

      {isRunning && (
        <>
          {url ? (
            <button
              onClick={(e) => { e.stopPropagation(); void open(url); }}
              title={`Dev server rodando — abrir ${url} no navegador`}
              className={`flex items-center gap-1.5 rounded-lg border font-medium transition-colors hover:border-border-default ${sizeClasses}`}
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span
                className="claude-dot h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'var(--success)', boxShadow: '0 0 5px var(--success)' }}
              />
              {variant === 'header' && (
                <span className="font-mono text-text-tertiary">{url.replace(/^https?:\/\//, '')}</span>
              )}
              <ExternalLink size={iconSize - 3} className="shrink-0 opacity-45" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setLogOpen((v) => !v); }}
              title="Dev server rodando — aguardando URL"
              className={`flex items-center gap-1.5 rounded-lg border font-medium ${sizeClasses}`}
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span
                className="claude-dot inline-block rounded-full"
                style={{ background: 'var(--success)', width: 6, height: 6, boxShadow: '0 0 5px var(--success)' }}
              />
              {variant === 'header' && <span>Rodando</span>}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); void restart(projectPath); }}
            title="Reiniciar dev server"
            className={`flex items-center justify-center rounded-md text-text-muted transition-all hover:bg-bg-active hover:text-text-primary ${variant === 'sidebar' ? 'h-6 w-6' : 'h-7 w-7'}`}
          >
            <RotateCw size={iconSize} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); void stop(projectPath); }}
            title="Parar dev server"
            className={`flex items-center justify-center rounded-md text-text-muted transition-all hover:bg-bg-active hover:text-text-primary ${variant === 'sidebar' ? 'h-6 w-6' : 'h-7 w-7'}`}
          >
            <Square size={iconSize} fill="currentColor" />
          </button>
        </>
      )}

      {logOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-lg border bg-bg-overlay shadow-lg"
          style={{ borderColor: isError ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'var(--border-default)' }}
        >
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{ borderColor: isError ? 'color-mix(in srgb, var(--danger) 25%, transparent)' : 'var(--border-subtle)' }}
          >
            <div
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: isError ? 'var(--danger)' : 'var(--accent)' }}
            >
              {isError ? <AlertTriangle size={12} /> : <Loader2 size={12} className="animate-spin" />}
              {isError ? 'Erro no dev server' : PHASE_LABEL[phase]}
            </div>
            <button
              onClick={() => setLogOpen(false)}
              className="rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            >×</button>
          </div>
          {errorMsg && (
            <div className="border-b border-border-subtle px-3 py-2 text-[11px] text-danger">
              {errorMsg}
            </div>
          )}
          <div className="max-h-48 overflow-y-auto bg-bg-base px-3 py-2 font-mono text-[10px] leading-relaxed text-text-tertiary">
            {recentLog.length === 0 ? (
              <div className="italic text-text-muted">sem logs ainda</div>
            ) : recentLog.slice(-25).map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{l}</div>
            ))}
          </div>
          {isError && (
            <div className="flex justify-end gap-1 border-t border-border-subtle px-3 py-2">
              <button
                onClick={(e) => { e.stopPropagation(); setLogOpen(false); void start(projectPath); }}
                className="rounded px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-strong)',
                }}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
