import { Command, FolderTree, Server, Star, Sparkles } from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore } from '@/stores/projectCustom';
import { useDevServersStore } from '@/stores/devServers';
import { PanelHeader } from './ui';

interface Props {
  onOpenPalette: () => void;
  onActivateProjects: () => void;
  onActivateServers: () => void;
}

export function HomePane({ onOpenPalette, onActivateProjects, onActivateServers }: Props) {
  const projectCount = useProjectsStore((s) => s.projects.length);
  const customs = useProjectCustomStore((s) => s.customs);
  const projects = useProjectsStore((s) => s.projects);
  const byPath = useDevServersStore((s) => s.byPath);

  const favCount = projects.filter((p) => customs[p.path]?.favorite).length;
  const runningCount = Object.values(byPath).filter(
    (d) => d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing'
  ).length;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={<Sparkles size={14} />} title="Voltz IDE" subtitle="Hub de terminais Claude Code" />

      <div className="flex-1 overflow-y-auto p-3">
        <button
          onClick={onOpenPalette}
          className="group mb-4 flex w-full items-center gap-2.5 rounded-xl bg-bg-base px-3 py-3 text-left transition-all hover:bg-bg-elev hover:shadow-sm"
        >
          <Command size={14} className="text-accent" />
          <span className="flex-1 text-[12px] font-medium text-text-primary">Buscar tudo</span>
          <kbd
            className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-muted group-hover:text-accent"
          >
            Ctrl+K
          </kbd>
        </button>

        <div className="mb-3 px-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Visão geral
        </div>

        <div className="space-y-2">
          <Quick
            icon={<FolderTree size={14} />}
            label="Projetos"
            value={projectCount}
            onClick={onActivateProjects}
          />
          <Quick
            icon={<Star size={14} className="text-warning" />}
            label="Favoritos"
            value={favCount}
            onClick={onActivateProjects}
          />
          <Quick
            icon={<Server size={14} className={runningCount > 0 ? 'text-success' : ''} />}
            label="Dev servers ativos"
            value={runningCount}
            onClick={onActivateServers}
            highlight={runningCount > 0}
          />
        </div>

        <div className="mt-6 mb-3 px-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Atalhos
        </div>
        <div className="space-y-1.5 text-[11px] text-text-tertiary">
          <Hint kbd="Ctrl+K" desc="Command palette" />
          <Hint kbd="Ctrl+T" desc="Nova aba" />
          <Hint kbd="Ctrl+,"  desc="Configurações" />
          <Hint kbd="Ctrl+Shift+\" desc="Split lado a lado" />
        </div>

        <div className="mt-6 rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
            <Sparkles size={11} />
            Dica
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-text-tertiary">
            Use <kbd className="rounded bg-bg-surface px-1 font-mono text-[10px] text-text-secondary">Ctrl+K</kbd> pra abrir
            qualquer projeto, rodar dev servers ou trocar de tema sem mexer no mouse.
          </p>
        </div>
      </div>
    </div>
  );
}

function Quick({
  icon, label, value, onClick, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border bg-bg-base px-3 py-2 text-left transition-all hover:border-border-default hover:bg-bg-hover"
      style={{
        borderColor: highlight ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'var(--border-subtle)',
      }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-active text-text-tertiary">
        {icon}
      </span>
      <span className="flex-1 text-[12px] font-medium text-text-secondary">{label}</span>
      <span className="text-[16px] font-extrabold tracking-tight text-text-primary">{value}</span>
    </button>
  );
}

function Hint({ kbd, desc }: { kbd: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <kbd className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
        {kbd}
      </kbd>
      <span>{desc}</span>
    </div>
  );
}
