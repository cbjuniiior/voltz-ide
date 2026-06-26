import { useMemo, useState, useEffect, useCallback } from 'react';
import { Globe, Square, Loader2, AlertTriangle, ExternalLink, Server, Play, RefreshCw, Network, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useDevServersStore } from '@/stores/devServers';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { getProjectColor } from '@/lib/projectColors';
import { toast } from '@/stores/toasts';
import { PanelHeader } from './ui';
import type { DevServerState, DevPortInfo } from '@shared/types';

export function ServersPane() {
  const byPath = useDevServersStore((s) => s.byPath);
  const stop = useDevServersStore((s) => s.stop);
  const open = useDevServersStore((s) => s.openInBrowser);
  const start = useDevServersStore((s) => s.start);
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);

  // Processos servindo no PC (inclui órfãos fora do app).
  const [detected, setDetected] = useState<DevPortInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const scan = useCallback(async () => {
    setScanning(true);
    try { setDetected(await window.api.devPorts.scan()); } catch { setDetected([]); }
    setScanning(false);
  }, []);
  useEffect(() => { void scan(); }, [scan]);
  async function killPid(pid: number) {
    const res = await window.api.devPorts.kill(pid);
    if (res.ok) { toast.success('Processo encerrado'); setTimeout(() => void scan(), 400); }
    else toast.error('Falha ao encerrar', res.error);
  }

  const list = useMemo(() => {
    return Object.values(byPath).sort((a, b) => {
      const order: Record<DevServerState['phase'], number> = {
        running: 0, starting: 1, installing: 2, error: 3, stopped: 4, idle: 5,
      };
      return order[a.phase] - order[b.phase];
    });
  }, [byPath]);

  const running = list.filter((d) => d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing');
  const others = list.filter((d) => !running.includes(d));

  function nameFor(path: string): string {
    const proj = projects.find((p) => p.path === path);
    if (!proj) return path.split(/[\\/]/).pop() ?? path;
    const c = selectCustom(customs, path);
    return c.alias || proj.name;
  }

  function colorFor(path: string): string {
    const proj = projects.find((p) => p.path === path);
    const c = selectCustom(customs, path);
    if (c.color) return c.color;
    return proj ? getProjectColor(proj.name).border : 'var(--accent)';
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<Server size={14} />}
        title="Dev Servers"
        subtitle={`${running.length} ativo(s) · ${list.length} total`}
      />

      <div className="flex-1 overflow-y-auto p-3">
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-default px-4 py-10 text-center">
            <Server size={20} className="mx-auto mb-2 text-text-disabled" />
            <p className="text-[12px] text-text-tertiary">Nenhum dev server iniciado</p>
            <p className="mt-1 text-[10px] text-text-muted">
              Hover num projeto e clique em ▶ Dev
            </p>
          </div>
        )}

        {running.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Em execução
            </div>
            <div className="space-y-2">
              {running.map((d) => (
                <ServerItem
                  key={d.projectPath}
                  state={d}
                  name={nameFor(d.projectPath)}
                  accent={colorFor(d.projectPath)}
                  onOpen={() => d.url && open(d.url)}
                  onStop={() => stop(d.projectPath)}
                  onStart={() => start(d.projectPath)}
                />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Histórico
            </div>
            <div className="space-y-2">
              {others.map((d) => (
                <ServerItem
                  key={d.projectPath}
                  state={d}
                  name={nameFor(d.projectPath)}
                  accent={colorFor(d.projectPath)}
                  onOpen={() => d.url && open(d.url)}
                  onStop={() => stop(d.projectPath)}
                  onStart={() => start(d.projectPath)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Servindo no seu PC — inclui dev servers órfãos iniciados fora do app */}
        <div className="mt-5">
          <div
            onClick={() => setPcOpen((v) => !v)}
            className="mb-2 flex cursor-pointer select-none items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-bg-hover"
          >
            {pcOpen ? <ChevronDown size={12} className="shrink-0 text-text-muted" /> : <ChevronRight size={12} className="shrink-0 text-text-muted" />}
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Servindo no seu PC</span>
            <span className="rounded-full bg-bg-active px-1.5 py-px text-[9px] font-bold tabular-nums text-text-tertiary">{detected.length}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setPcOpen(true); void scan(); }}
              title="Reescanear portas"
              className="ml-auto flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
            >
              <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
            </button>
          </div>
          {pcOpen && (
            <>
              {detected.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-subtle px-3 py-3 text-center text-[10.5px] text-text-muted">
                  {scanning ? 'Escaneando portas…' : 'Nenhum processo servindo'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detected.map((d) => (
                    <DetectedItem key={d.pid} info={d} onKill={() => void killPid(d.pid)} />
                  ))}
                </div>
              )}
              <p className="mt-1.5 px-1 text-[9.5px] leading-relaxed text-text-muted">
                Processos node/bun/python… escutando em portas locais — pega órfãos de fora do app.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetectedItem({ info, onKill }: { info: DevPortInfo; onKill: () => void }) {
  const short = info.cmd ? info.cmd.replace(/"/g, '').replace(/^.*[\\/]/, '').slice(0, 64) : info.name;
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5">
      <Network size={13} className="shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          {info.ports.slice(0, 4).map((p) => (
            <span key={p} className="rounded bg-bg-active px-1.5 py-px font-mono text-[10px] font-bold text-text-secondary">:{p}</span>
          ))}
          <span className="truncate text-[11px] text-text-tertiary">{info.name.replace(/\.exe$/i, '')}</span>
        </div>
        <div className="truncate font-mono text-[9.5px] text-text-muted" title={info.cmd || info.name}>PID {info.pid} · {short}</div>
      </div>
      <button onClick={onKill} title="Matar este processo e a árvore" className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10.5px] font-semibold text-danger transition-all hover:bg-danger-soft">
        <X size={12} /> Matar
      </button>
    </div>
  );
}

function ServerItem({
  state, name, accent, onOpen, onStop, onStart,
}: {
  state: DevServerState;
  name: string;
  accent: string;
  onOpen: () => void;
  onStop: () => void;
  onStart: () => void;
}) {
  const isRunning = state.phase === 'running';
  const isBusy = state.phase === 'starting' || state.phase === 'installing';
  const isError = state.phase === 'error';

  const phaseColor =
    isRunning ? 'var(--success)' :
    isError   ? 'var(--danger)'  :
    isBusy    ? 'var(--warning)' :
                'var(--text-muted)';

  return (
    <div
      className="overflow-hidden rounded-lg border bg-bg-base shadow-sm"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2 w-2 shrink-0 rounded-full claude-dot"
          style={{ background: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }} />
        <span className="flex-1 truncate text-[12px] font-semibold tracking-tight"
          style={{ color: accent }} title={state.projectPath}>
          {name}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: phaseColor }}>
          {state.phase}
        </span>
      </div>

      {state.url && isRunning && (
        <button
          onClick={onOpen}
          className="flex w-full items-center gap-1.5 border-t border-border-subtle bg-bg-surface px-3 py-1.5 text-left transition-colors hover:bg-bg-hover"
        >
          <Globe size={11} className="shrink-0 text-success" />
          <span className="flex-1 truncate font-mono text-[10px] text-text-secondary">
            {state.url.replace(/^https?:\/\//, '')}
          </span>
          <ExternalLink size={10} className="shrink-0 text-text-muted" />
        </button>
      )}

      {isError && state.errorMessage && (
        <div className="border-t border-border-subtle bg-bg-surface px-3 py-1.5">
          <p className="truncate text-[10px] text-danger" title={state.errorMessage}>
            <AlertTriangle size={10} className="mr-1 inline" />
            {state.errorMessage}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-border-subtle bg-bg-surface px-2 py-1">
        {(state.phase === 'idle' || state.phase === 'stopped' || state.phase === 'error') && (
          <button
            onClick={onStart}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-bg-hover"
          >
            <Play size={9} fill="currentColor" /> Iniciar
          </button>
        )}
        {(isRunning || isBusy) && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-danger hover:bg-bg-hover"
          >
            <Square size={9} fill="currentColor" /> Parar
          </button>
        )}
        {isBusy && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-warning">
            <Loader2 size={9} className="animate-spin" />
            {state.phase === 'installing' ? 'instalando' : 'iniciando'}
          </span>
        )}
        <span className="ml-auto text-[9px] text-text-muted">{state.pm}</span>
      </div>
    </div>
  );
}
