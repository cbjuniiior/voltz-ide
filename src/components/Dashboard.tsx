import { useMemo } from 'react';
import {
  Command, Folder, Star, Play, Globe, Loader2, AlertTriangle, ExternalLink,
  GitBranch, Sparkles, ListChecks, Check, Clock, TrendingUp, Timer,
} from 'lucide-react';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDevServersStore, selectDevServer } from '@/stores/devServers';
import { useTasksStore, todayKey, toKey } from '@/stores/tasks';
import { getProjectColor } from '@/lib/projectColors';
import { LogoMark } from './Logo';
import type { Project, DevServerState } from '@shared/types';

/** "45min", "2h", "2h30". */
function fmtDur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return '0min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

interface Props {
  onOpenPalette: () => void;
}

export function Dashboard({ onOpenPalette }: Props) {
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const openProjectInNewTab = useWorkspaceStore((s) => s.openProjectInNewTab);
  const devServers = useDevServersStore((s) => s.byPath);
  const tasks = useTasksStore((s) => s.tasks);
  const toggleTask = useTasksStore((s) => s.toggle);
  const today = todayKey();

  const todayTasks = useMemo(
    () => tasks
      .filter((t) => !t.done && t.date <= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.priority ?? 5) - (b.priority ?? 5)))
      .slice(0, 12),
    [tasks, today],
  );
  const pendingCount = useMemo(() => tasks.filter((t) => !t.done && t.date <= today).length, [tasks, today]);

  const stats = useMemo(() => {
    const fav = projects.filter((p) => customs[p.path]?.favorite).length;
    const runningServers = Object.values(devServers).filter(
      (d) => d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing'
    );
    return { total: projects.length, fav, running: runningServers.length };
  }, [projects, customs, devServers]);

  const favorites = useMemo(
    () => projects.filter((p) => customs[p.path]?.favorite).slice(0, 8),
    [projects, customs],
  );
  const recent = useMemo(() => projects.slice(0, 12), [projects]);

  const runningServersList = useMemo(
    () => Object.entries(devServers).filter(([, d]) =>
      d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing' || d.phase === 'error'
    ),
    [devServers],
  );

  // Métricas de produtividade (7 dias + foco por cliente).
  const analytics = useMemo(() => {
    const now = new Date();
    const days: { key: string; weekday: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ key: toKey(d), weekday: d.getDay() });
    }
    const doneByDay = days.map((d) => ({
      ...d,
      count: tasks.filter((t) => t.done && t.date === d.key).length,
    }));

    let focusTotal = 0;
    let focusToday = 0;
    const clientFocus = new Map<string, number>();
    for (const t of tasks) {
      const ms = t.timeSpentMs ?? 0;
      if (ms <= 0) continue;
      focusTotal += ms;
      if (t.date === today) focusToday += ms;
      const key = t.client || 'Sem cliente';
      clientFocus.set(key, (clientFocus.get(key) ?? 0) + ms);
    }
    const clients = [...clientFocus.entries()]
      .map(([name, ms]) => ({ name, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 6);
    const clientMax = clients.reduce((m, c) => Math.max(m, c.ms), 0);

    const doneToday = tasks.filter((t) => t.done && t.date === today).length;
    const doneWeek = doneByDay.reduce((s, d) => s + d.count, 0);
    const dayMax = doneByDay.reduce((m, d) => Math.max(m, d.count), 0);

    return { doneByDay, focusTotal, focusToday, clients, clientMax, doneToday, doneWeek, dayMax };
  }, [tasks, today]);

  const hasProductivity = analytics.focusTotal > 0 || analytics.doneWeek > 0;

  function open(p: Project) {
    const c = selectCustom(customs, p.path);
    openProjectInNewTab(c.alias || p.name, p.path);
  }

  return (
    <div className="welcome-fade relative h-full overflow-y-auto bg-bg-base">
      {/* Background decoration */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 15% 25%, var(--accent-soft) 0%, transparent 45%),
                       radial-gradient(circle at 85% 75%, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 55%)`,
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-8 py-10">
        {/* Hero */}
        <header className="flex flex-col items-start gap-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-md"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
              boxShadow: '0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)',
            }}
          >
            <LogoMark size={32} color="#fff" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-text-primary">
              Bem-vindo ao <span className="text-accent">Voltz IDE</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-text-tertiary">
              Hub de terminais Claude Code. Abra projetos, rode dev servers, gerencie sessões — tudo num só lugar.
            </p>
          </div>

          <button
            onClick={onOpenPalette}
            className="group mt-2 flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-elev px-5 py-3.5 shadow-sm transition-all hover:scale-[1.01] hover:border-accent/60 hover:bg-bg-overlay hover:shadow-md"
          >
            <Command size={18} className="text-accent" />
            <span className="text-[14px] font-medium text-text-primary">Procurar projetos, abrir abas, rodar comandos…</span>
            <kbd className="ml-2 rounded-md border border-border-subtle bg-bg-base px-2 py-0.5 font-mono text-[11px] text-text-muted group-hover:border-accent/40 group-hover:text-accent">
              Ctrl+K
            </kbd>
          </button>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Projetos" value={stats.total} icon={<Folder size={16} />} />
          <StatCard label="Favoritos" value={stats.fav} icon={<Star size={16} />} accent="warning" />
          <StatCard label="Dev servers ativos" value={stats.running} icon={<Server />} accent="success" />
          <StatCard label="Tarefas pra hoje" value={pendingCount} icon={<ListChecks size={16} />} accent={pendingCount > 0 ? 'warning' : 'accent'} />
        </section>

        {/* Produtividade — gráficos */}
        {hasProductivity && (
          <Section title="Produtividade" icon={<TrendingUp size={14} />}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* KPIs de foco */}
              <div className="flex flex-col gap-3">
                <KpiTile
                  icon={<Timer size={15} />}
                  label="Foco hoje"
                  value={fmtDur(analytics.focusToday)}
                  accent="accent"
                />
                <KpiTile
                  icon={<Check size={15} />}
                  label="Concluídas hoje"
                  value={String(analytics.doneToday)}
                  accent="success"
                />
                <KpiTile
                  icon={<Clock size={15} />}
                  label="Foco total"
                  value={fmtDur(analytics.focusTotal)}
                  accent="warning"
                />
              </div>

              {/* Tarefas concluídas — 7 dias */}
              <div className="surface-card flex flex-col p-4 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Concluídas · 7 dias</span>
                  <span className="text-[11px] font-semibold text-text-tertiary">{analytics.doneWeek} no total</span>
                </div>
                <div className="flex flex-1 items-end gap-2" style={{ minHeight: 120 }}>
                  {analytics.doneByDay.map((d, i) => {
                    const pct = analytics.dayMax > 0 ? (d.count / analytics.dayMax) * 100 : 0;
                    const isToday = i === analytics.doneByDay.length - 1;
                    return (
                      <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-text-tertiary" style={{ opacity: d.count ? 1 : 0.4 }}>
                          {d.count || ''}
                        </span>
                        <div className="flex w-full flex-1 items-end">
                          <div
                            className="w-full rounded-md transition-all"
                            style={{
                              height: `${Math.max(pct, d.count ? 8 : 3)}%`,
                              minHeight: 4,
                              background: isToday
                                ? 'linear-gradient(180deg, var(--accent-hover), var(--accent))'
                                : 'color-mix(in srgb, var(--accent) 40%, var(--bg-active))',
                            }}
                          />
                        </div>
                        <span className="text-[9px] uppercase tracking-wide text-text-muted" style={{ fontWeight: isToday ? 700 : 400 }}>
                          {WEEKDAY[d.weekday]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Foco por cliente */}
            {analytics.clients.length > 0 && (
              <div className="surface-card mt-4 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Foco por cliente</span>
                <div className="mt-3 space-y-2.5">
                  {analytics.clients.map((c) => {
                    const pct = analytics.clientMax > 0 ? (c.ms / analytics.clientMax) * 100 : 0;
                    const color = c.name === 'Sem cliente' ? 'var(--text-muted)' : getProjectColor(c.name).border;
                    return (
                      <div key={c.name} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-[12px] font-medium text-text-secondary" title={c.name}>
                          {c.name}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-active">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(pct, 4)}%`, background: color }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-text-tertiary">
                          {fmtDur(c.ms)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Tarefas de hoje */}
        {todayTasks.length > 0 && (
          <Section title="Tarefas de hoje" icon={<ListChecks size={14} />}>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {todayTasks.map((t) => {
                const overdue = t.date < today;
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTask(t.id)}
                    className="group flex items-center gap-2.5 rounded-xl border border-border-subtle bg-bg-surface px-3 py-2.5 text-left shadow-sm transition-colors hover:border-border-default"
                  >
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-border-default transition-colors group-hover:border-accent">
                      <Check size={12} className="text-text-disabled group-hover:text-accent" />
                    </span>
                    <span className="flex-1 truncate text-[13px] text-text-secondary">{t.text}</span>
                    {t.projectName && (
                      <span className="shrink-0 truncate text-[10px] text-text-muted" title={t.projectName}>
                        {t.projectName}
                      </span>
                    )}
                    {overdue && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                      >
                        atrasada
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Running Dev Servers */}
        {runningServersList.length > 0 && (
          <Section title="Dev servers ativos" icon={<Sparkles size={14} />}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {runningServersList.map(([path, ds]) => {
                const proj = projects.find((p) => p.path === path);
                const c = proj ? selectCustom(customs, path) : null;
                const name = c?.alias || proj?.name || path.split(/[\\/]/).pop() || path;
                return <DevServerCard key={path} name={name} state={ds} />;
              })}
            </div>
          </Section>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <Section title="Favoritos" icon={<Star size={14} className="text-warning" />}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {favorites.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  customs={customs}
                  devServer={selectDevServer(devServers, p.path)}
                  onOpen={() => open(p)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Recent / All */}
        <Section title="Projetos" icon={<Folder size={14} />}>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-default px-6 py-12 text-center">
              <p className="text-sm text-text-muted">Nenhum projeto ainda.</p>
              <p className="mt-1 text-[11px] text-text-disabled">
                Adicione uma pasta raiz nas Configurações.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {recent.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  customs={customs}
                  devServer={selectDevServer(devServers, p.path)}
                  onOpen={() => open(p)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Server() {
  // small inline icon clone (avoid extra import path collisions)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <rect x="2" y="3" width="20" height="8" rx="2" />
      <rect x="2" y="13" width="20" height="8" rx="2" />
      <line x1="6" y1="7" x2="6" y2="7" />
      <line x1="6" y1="17" x2="6" y2="17" />
    </svg>
  );
}

function Section({
  title, icon, children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{title}</h2>
        <div className="ml-2 flex-1 border-t border-border-subtle" />
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label, value, icon, accent = 'accent',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'accent' | 'warning' | 'success';
}) {
  const color =
    accent === 'warning' ? 'var(--warning)' :
    accent === 'success' ? 'var(--success)' :
                            'var(--accent)';
  const soft =
    accent === 'warning' ? 'var(--warning-soft)' :
    accent === 'success' ? 'var(--success-soft)' :
                            'var(--accent-soft)';
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-surface px-5 py-4 shadow-sm transition-all hover:scale-[1.01] hover:border-border-default">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: soft, color }}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-3xl font-extrabold tracking-tight text-text-primary">{value}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function KpiTile({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'accent' | 'warning' | 'success';
}) {
  const color =
    accent === 'warning' ? 'var(--warning)' :
    accent === 'success' ? 'var(--success)' :
                            'var(--accent)';
  const soft =
    accent === 'warning' ? 'var(--warning-soft)' :
    accent === 'success' ? 'var(--success-soft)' :
                            'var(--accent-soft)';
  return (
    <div className="surface-card flex flex-1 items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: soft, color }}>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-xl font-extrabold tracking-tight text-text-primary">{value}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function ProjectCard({
  project, customs, devServer, onOpen,
}: {
  project: Project;
  customs: Record<string, ReturnType<typeof selectCustom>>;
  devServer: DevServerState | null;
  onOpen: () => void;
}) {
  const custom = selectCustom(customs, project.path);
  const auto = getProjectColor(project.name);
  const accent = custom.color ?? auto.border;
  const name = custom.alias || project.name;
  const phase = devServer?.phase;
  const isRunning = phase === 'running';
  const isBusy = phase === 'installing' || phase === 'starting';
  const isError = phase === 'error';
  const start = useDevServersStore((s) => s.start);
  const open = useDevServersStore((s) => s.openInBrowser);

  return (
    <div
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border-subtle bg-bg-surface p-4 shadow-sm transition-all hover:scale-[1.02] hover:border-border-default hover:shadow-md"
    >
      {/* Top accent line */}
      <span
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ background: accent, opacity: 0.6 }}
      />

      <div className="flex items-start justify-between gap-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base"
          style={{
            background: `${accent}1c`,
            border: `1px solid ${accent}45`,
            color: accent,
          }}
        >
          {custom.emoji ? <span className="text-[18px]">{custom.emoji}</span> : <Folder size={16} />}
        </div>
        {custom.favorite && (
          <Star size={12} fill="currentColor" className="shrink-0 text-warning" />
        )}
      </div>

      <div className="mt-3 truncate text-[14px] font-bold tracking-tight text-text-primary" title={name}>
        {name}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-text-muted" title={project.path}>
        {project.path.split(/[\\/]/).slice(-3, -1).join('/')}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {isRunning && devServer?.url ? (
          <button
            onClick={(e) => { e.stopPropagation(); void open(devServer.url!); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: 'var(--success-soft)',
              color: 'var(--success)',
              border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
            }}
          >
            <Globe size={11} /> Abrir
            <ExternalLink size={9} className="opacity-70" />
          </button>
        ) : isBusy ? (
          <span
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold"
            style={{
              background: 'var(--warning-soft)',
              color: 'var(--warning)',
              border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
            }}
          >
            <Loader2 size={11} className="animate-spin" />
            {phase === 'installing' ? 'Instalando' : 'Iniciando'}
          </span>
        ) : isError ? (
          <span
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold"
            style={{
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
            }}
          >
            <AlertTriangle size={11} /> Erro
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); void start(project.path); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition-all opacity-0 hover:scale-[1.02] group-hover:opacity-100"
            style={{
              background: `${accent}1c`,
              color: accent,
              border: `1px solid ${accent}50`,
            }}
          >
            <Play size={10} fill="currentColor" /> Dev
          </button>
        )}
        {project.isGit && (
          <GitBranch size={11} className="text-text-muted" />
        )}
      </div>
    </div>
  );
}

function DevServerCard({ name, state }: { name: string; state: DevServerState }) {
  const open = useDevServersStore((s) => s.openInBrowser);
  const stop = useDevServersStore((s) => s.stop);
  const isRunning = state.phase === 'running';
  const isError = state.phase === 'error';
  const accent = isError ? 'var(--danger)'
              : isRunning ? 'var(--success)'
              : 'var(--warning)';
  const accentSoft = isError ? 'var(--danger-soft)'
                  : isRunning ? 'var(--success-soft)'
                  : 'var(--warning-soft)';

  return (
    <div
      className="rounded-xl border bg-bg-surface p-4 shadow-sm transition-all hover:shadow-md"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="claude-dot inline-block rounded-full"
          style={{ background: accent, width: 8, height: 8, boxShadow: `0 0 8px ${accent}` }}
        />
        <span className="flex-1 truncate text-[13px] font-bold tracking-tight text-text-primary">{name}</span>
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: accentSoft, color: accent }}
        >
          {state.phase}
        </span>
      </div>

      {state.url && (
        <button
          onClick={() => void open(state.url!)}
          className="mt-3 flex w-full items-center gap-2 rounded-md border bg-bg-base px-3 py-2 text-left text-[12px] font-mono transition-colors hover:border-accent"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <Globe size={12} className="shrink-0 text-success" />
          <span className="flex-1 truncate">{state.url}</span>
          <ExternalLink size={11} className="shrink-0 text-text-muted" />
        </button>
      )}

      {state.errorMessage && (
        <p className="mt-2 truncate text-[11px] text-danger" title={state.errorMessage}>
          {state.errorMessage}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted">
        <span>{state.pm} · {state.recentLog.length} linha(s)</span>
        <button
          onClick={() => void stop(state.projectPath)}
          className="rounded px-2 py-0.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-danger"
        >
          Parar
        </button>
      </div>
    </div>
  );
}
