import { useEffect, useMemo } from 'react';
import { Users, Download, Loader2, Check, Play, Trash2, Wand2, RefreshCw } from 'lucide-react';
import { useSquadStore, allInstalled } from '@/stores/squad';
import { useWorkspaceStore } from '@/stores/workspace';
import { collectLeaves } from '@/lib/layoutTree';
import { PERSONAS, MAESTRO_ID, personaCommand } from '@/lib/personaCatalog';
import { toast } from '@/stores/toasts';

/** Painel do Esquadrão — instala as personas globalmente e as coloca pra rodar. */
export function SquadPane() {
  const installed = useSquadStore((s) => s.installed);
  const loaded = useSquadStore((s) => s.loaded);
  const busy = useSquadStore((s) => s.busy);
  const version = useSquadStore((s) => s.version);
  const load = useSquadStore((s) => s.load);
  const install = useSquadStore((s) => s.install);
  const uninstall = useSquadStore((s) => s.uninstall);
  const openAgent = useWorkspaceStore((s) => s.openAgent);
  const openSquadCanvas = useWorkspaceStore((s) => s.openSquadCanvas);

  // Projeto ativo (primeira folha com projeto na aba ativa).
  // IMPORTANTE: selecionar primitivos estáveis (tabs/activeTabId) e derivar com
  // useMemo — um seletor que retorna objeto novo a cada render causa loop infinito.
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const activeProject = useMemo(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return null;
    for (const l of collectLeaves(tab.root)) {
      if (l.projectPath) return { path: l.projectPath, name: l.projectName ?? 'Projeto' };
    }
    return null;
  }, [tabs, activeTabId]);

  useEffect(() => { void load(); }, [load]);

  const ready = allInstalled(installed);

  async function doInstall() {
    const res = await install();
    if (res.ok) toast.success('Esquadrão instalado — vale em todos os projetos');
    else toast.error(res.error || 'Falha ao instalar');
  }

  async function runPersona(id: string, label: string) {
    if (!ready) { toast.error('Instale o Esquadrão primeiro'); return; }
    // Injeta o perfil de stack do projeto para a persona se adaptar.
    let append: string | undefined;
    if (activeProject) {
      try { append = (await window.api.agents.detectStack(activeProject.path)) || undefined; } catch { /* ignore */ }
    }
    openAgent(personaCommand(id, append), label, activeProject?.name ?? null, activeProject?.path ?? null, id);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Users size={14} />
          </span>
          <span className="text-[13px] font-bold text-text-primary">Esquadrão</span>
          {version && <span className="ml-auto text-[10px] text-text-muted">v{version}</span>}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
          Um time de personas de IA especialistas que trabalham juntas — instaladas
          globalmente (valem em <b>todos os projetos</b>). O Maestro coordena e delega.
        </p>
      </div>

      {/* Ação principal */}
      <div className="shrink-0 space-y-2 border-b border-border-subtle px-4 py-3">
        {!ready ? (
          <button
            onClick={() => void doInstall()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold transition-all hover:brightness-110 disabled:cursor-wait"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {busy ? 'Instalando…' : 'Instalar Esquadrão'}
          </button>
        ) : (
          <>
            <button
              onClick={() => openSquadCanvas(activeProject?.name ?? null, activeProject?.path ?? null)}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold transition-all hover:brightness-110"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Wand2 size={14} /> Abrir Canvas do Esquadrão
            </button>
            <button
              onClick={() => void runPersona(MAESTRO_ID, '🎼 Maestro')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[11.5px] font-medium text-text-secondary transition-colors hover:bg-bg-hover"
            >
              <Play size={13} /> Só o Maestro (numa aba)
            </button>
            {activeProject
              ? <p className="text-center text-[10.5px] text-text-muted">projeto: <b>{activeProject.name}</b></p>
              : <p className="text-center text-[10.5px] text-warning">Abra um projeto primeiro.</p>}
          </>
        )}
      </div>

      {/* Lista de personas */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-1.5">
          {PERSONAS.map((p) => {
            const isInstalled = installed.includes(p.id);
            return (
              <div
                key={p.id}
                className="group flex items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-surface px-2.5 py-2"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[16px]"
                  style={{ background: `color-mix(in srgb, ${p.color} 20%, transparent)` }}
                >
                  {p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-semibold text-text-primary">{p.name}</span>
                    <span className="rounded px-1 py-px text-[8.5px] font-bold uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${p.color} 16%, transparent)`, color: p.color }}>{p.model}</span>
                    {isInstalled && <Check size={11} className="text-success" />}
                  </div>
                  <p className="truncate text-[10.5px] text-text-muted">{p.role} · {p.description}</p>
                </div>
                <button
                  onClick={() => void runPersona(p.id, `${p.emoji} ${p.name}`)}
                  disabled={!ready}
                  title={`Rodar ${p.name} numa nova aba`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-30"
                >
                  <Play size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Gestão */}
        {ready && (
          <div className="mt-3 flex items-center justify-between px-1">
            <button onClick={() => void doInstall()} disabled={busy} className="flex items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-text-secondary">
              <RefreshCw size={11} /> Reinstalar/atualizar
            </button>
            <button onClick={() => void uninstall()} disabled={busy} className="flex items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-danger">
              <Trash2 size={11} /> Remover
            </button>
          </div>
        )}
        {!loaded && (
          <div className="flex items-center justify-center gap-1.5 py-6 text-[11px] text-text-muted">
            <Loader2 size={13} className="animate-spin" /> carregando…
          </div>
        )}
      </div>
    </div>
  );
}
