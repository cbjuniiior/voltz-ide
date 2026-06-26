import { useEffect, useMemo, useState } from 'react';
import {
  Clock, TrendingUp, Timer, Check, Flame, Server, GitBranch, Sparkles,
  Folder, Star, UserRound, Command, LayoutDashboard, Target, History,
  ArrowUp, ArrowDown, Minus, X,
} from 'lucide-react';
import { useAppUsageStore, fmtDuration } from '@/stores/appUsage';
import { useTasksStore, toKey, todayKey } from '@/stores/tasks';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { useProjectsStore } from '@/stores/projects';
import { useProjectCustomStore } from '@/stores/projectCustom';
import { useDevServersStore } from '@/stores/devServers';
import { useGitStore } from '@/stores/git';
import { useWorkspaceStore } from '@/stores/workspace';
import { getProjectColor } from '@/lib/projectColors';
import { LogoMark } from './Logo';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

interface UsageWindow { key: string; label: string; utilization: number; resetsAt: string | null }

function lastNDays(now: Date, n: number): { key: string; weekday: number }[] {
  const out: { key: string; weekday: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ key: toKey(d), weekday: d.getDay() });
  }
  return out;
}

function greeting(h: number): string {
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

interface Props { onOpenPalette: () => void; onClose?: () => void }

export function AnalyticsDashboard({ onOpenPalette, onClose }: Props) {
  const days = useAppUsageStore((s) => s.days);
  const byHour = useAppUsageStore((s) => s.byHour);
  const projectMs = useAppUsageStore((s) => s.projects);
  const goals = useAppUsageStore((s) => s.goals);
  const setGoals = useAppUsageStore((s) => s.setGoals);
  const tasks = useTasksStore((s) => s.tasks);
  const accounts = useAccountsStore((s) => s.accounts);
  const identities = useAccountsStore((s) => s.identities);
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const devServers = useDevServersStore((s) => s.byPath);
  const gitByPath = useGitStore((s) => s.byPath);
  const tabs = useWorkspaceStore((s) => s.tabs);

  const now = useMemo(() => new Date(), []);
  const today = todayKey();
  const days14 = useMemo(() => lastNDays(now, 14), [now]);
  const week = days14.slice(7);
  const prevWeek = days14.slice(0, 7);

  const sum = (keys: { key: string }[], map: Record<string, number>) => keys.reduce((s, d) => s + (map[d.key] ?? 0), 0);

  // ---- Tempo de uso ----
  const usage = useMemo(() => {
    const todayMs = days[today] ?? 0;
    const weekMs = sum(week, days);
    const prevWeekMs = sum(prevWeek, days);
    const daysUsed = week.filter((d) => (days[d.key] ?? 0) > 60_000).length;
    const avgMs = daysUsed ? weekMs / daysUsed : 0;
    const maxMs = week.reduce((m, d) => Math.max(m, days[d.key] ?? 0), 0);
    let streak = 0;
    for (let i = week.length - 1; i >= 0; i--) {
      if ((days[week[i].key] ?? 0) > 60_000) streak++;
      else if (i === week.length - 1) continue;
      else break;
    }
    return { todayMs, weekMs, prevWeekMs, avgMs, maxMs, streak, daysUsed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, today]);

  // ---- Produtividade ----
  const prod = useMemo(() => {
    const doneByDay = week.map((d) => ({ ...d, count: tasks.filter((t) => t.done && t.date === d.key).length }));
    const dayMax = doneByDay.reduce((m, d) => Math.max(m, d.count), 0);
    const doneOn = (keys: { key: string }[]) => keys.reduce((s, d) => s + tasks.filter((t) => t.done && t.date === d.key).length, 0);
    const doneToday = tasks.filter((t) => t.done && t.date === today).length;
    const doneWeek = doneOn(week);
    const donePrev = doneOn(prevWeek);
    const focusOn = (keys: { key: string }[]) => tasks.filter((t) => keys.some((k) => k.key === t.date)).reduce((s, t) => s + (t.timeSpentMs ?? 0), 0);
    const focusToday = tasks.filter((t) => t.date === today).reduce((s, t) => s + (t.timeSpentMs ?? 0), 0);
    const focusTotal = tasks.reduce((s, t) => s + (t.timeSpentMs ?? 0), 0);
    const focusWeek = focusOn(week);
    const focusPrev = focusOn(prevWeek);
    const clientFocus = new Map<string, number>();
    for (const t of tasks) {
      const ms = t.timeSpentMs ?? 0;
      if (ms <= 0) continue;
      const key = t.client || 'Sem cliente';
      clientFocus.set(key, (clientFocus.get(key) ?? 0) + ms);
    }
    const clients = [...clientFocus.entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms).slice(0, 5);
    const clientMax = clients.reduce((m, c) => Math.max(m, c.ms), 0);
    const pending = tasks.filter((t) => !t.done && t.date <= today).length;
    return { doneByDay, dayMax, doneToday, doneWeek, donePrev, focusToday, focusTotal, focusWeek, focusPrev, clients, clientMax, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today]);

  // ---- Tempo por projeto ----
  const topProjects = useMemo(() => {
    const arr = Object.entries(projectMs).map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms).slice(0, 6);
    const max = arr.reduce((m, p) => Math.max(m, p.ms), 0);
    return { arr, max };
  }, [projectMs]);

  // ---- Horários de pico ----
  const hourMax = useMemo(() => Object.values(byHour).reduce((m, v) => Math.max(m, v), 0), [byHour]);

  // ---- Workspace agora ----
  const live = useMemo(() => ({
    devRunning: Object.values(devServers).filter((d) => d.phase === 'running').length,
    gitChanges: Object.values(gitByPath).reduce((s, g) => s + (g?.changes ?? 0), 0),
    favCount: projects.filter((p) => customs[p.path]?.favorite).length,
    tabCount: tabs.length,
    projectCount: projects.length,
  }), [devServers, gitByPath, projects, customs, tabs]);

  // ---- Uso das contas Claude (do cache do store, evita rate-limit) ----
  const usageCache = useAccountsStore((s) => s.usage);
  const refreshUsage = useAccountsStore((s) => s.refreshUsage);
  useEffect(() => {
    accounts.filter((a) => identities[a.id]?.connected).forEach((a) => { void refreshUsage(a.id); });
  }, [accounts, identities, refreshUsage]);
  const usageByAccount: Record<string, UsageWindow[]> = useMemo(() => {
    const out: Record<string, UsageWindow[]> = {};
    for (const a of accounts) { const u = usageCache[a.id]; if (u?.ok) out[a.id] = u.windows; }
    return out;
  }, [accounts, usageCache]);

  // ---- Sessões do Claude por dia ----
  const [sessionsByDay, setSessionsByDay] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    void window.api.claude.allSessions(200).then((list) => {
      if (!alive) return;
      const map: Record<string, number> = {};
      for (const s of list) { const k = toKey(new Date(s.mtimeMs)); map[k] = (map[k] ?? 0) + 1; }
      setSessionsByDay(map);
    });
    return () => { alive = false; };
  }, []);
  const sessMax = week.reduce((m, d) => Math.max(m, sessionsByDay[d.key] ?? 0), 0);
  const sessWeek = week.reduce((s, d) => s + (sessionsByDay[d.key] ?? 0), 0);

  const focusToday = prod.focusToday;
  const connectedAccounts = accounts.filter((a) => identities[a.id]?.connected);

  return (
    <div className="welcome-fade h-full overflow-y-auto bg-bg-base">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-7 py-7">
        {/* Hero */}
        <header className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-md"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <LogoMark size={22} color="#fff" />
          </div>
          <div className="flex-1">
            <h1 className="text-[22px] font-extrabold tracking-tight text-text-primary">{greeting(now.getHours())} <span className="text-accent">👋</span></h1>
            <p className="text-[12.5px] text-text-tertiary">Painel de dados do Voltz IDE</p>
          </div>
          <button onClick={onOpenPalette}
            className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-surface px-4 py-2.5 shadow-sm transition-all hover:border-accent/60">
            <Command size={15} className="text-accent" />
            <span className="text-[13px] font-medium text-text-secondary">Buscar tudo</span>
            <kbd className="rounded bg-bg-active px-1.5 py-0.5 font-mono text-[10px] text-text-muted">Ctrl+K</kbd>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Fechar (Esc)"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-border-subtle bg-bg-surface text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={17} />
            </button>
          )}
        </header>

        {/* Resumo do dia — faixa de destaque */}
        <div className="surface-card relative overflow-hidden p-5"
          style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 12%, var(--bg-surface)), var(--bg-surface) 60%)' }}>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-accent" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Resumo de hoje</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <BigStat icon={<Clock size={16} />} value={fmtDuration(usage.todayMs)} label="app aberto" />
            <BigStat icon={<Timer size={16} />} value={fmtDuration(focusToday)} label="em foco" />
            <BigStat icon={<Check size={16} />} value={String(prod.doneToday)} label="tarefas feitas" />
            <BigStat icon={<History size={16} />} value={String(sessionsByDay[today] ?? 0)} label="sessões Claude" />
          </div>
        </div>

        {/* Tempo de uso + Metas */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="surface-card flex flex-col p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Clock size={13} /> Tempo de uso · 7 dias</span>
              <Delta now={usage.weekMs} prev={usage.prevWeekMs} fmt={fmtDuration} />
            </div>
            <BarChart7 bars={week.map((d) => ({ weekday: d.weekday, value: days[d.key] ?? 0, label: usage.maxMs ? fmtDuration(days[d.key] ?? 0) : '' }))}
              max={usage.maxMs} colorFor={() => 'var(--accent)'} />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border-subtle pt-3 text-[11px]">
              <InlineStat label="Semana" value={fmtDuration(usage.weekMs)} />
              <InlineStat label="Média/dia" value={fmtDuration(usage.avgMs)} />
              <span className="flex items-center gap-1 font-semibold" style={{ color: usage.streak > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                <Flame size={12} /> {usage.streak > 0 ? `${usage.streak} dias seguidos` : 'sem sequência'}
              </span>
            </div>
          </div>

          <div className="surface-card flex flex-col gap-3.5 p-4">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Target size={13} /> Metas de hoje</span>
            <GoalRow label="App aberto" cur={usage.todayMs / 3_600_000} goal={goals.appMin / 60} unit="h" step={0.5} onGoal={(h) => setGoals({ appMin: Math.round(h * 60) })} fmtCur={() => fmtDuration(usage.todayMs)} />
            <GoalRow label="Foco" cur={focusToday / 3_600_000} goal={goals.focusMin / 60} unit="h" step={0.5} onGoal={(h) => setGoals({ focusMin: Math.round(h * 60) })} fmtCur={() => fmtDuration(focusToday)} />
            <GoalRow label="Tarefas" cur={prod.doneToday} goal={goals.tasks} unit="" step={1} onGoal={(v) => setGoals({ tasks: Math.round(v) })} fmtCur={() => String(prod.doneToday)} />
          </div>
        </div>

        {/* Horários de pico */}
        {hourMax > 0 && (
          <Section title="Horários de pico" icon={<Clock size={14} />}>
            <div className="surface-card p-4">
              <div className="flex items-end gap-1" style={{ height: 64 }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = byHour[h] ?? 0;
                  const pct = hourMax ? (v / hourMax) * 100 : 0;
                  return (
                    <div key={h} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${h}h · ${fmtDuration(v)}`}>
                      <div className="w-full rounded-sm transition-all" style={{ height: `${Math.max(pct, v > 0 ? 8 : 2)}%`, background: v > 0 ? `color-mix(in srgb, var(--accent) ${30 + pct * 0.7}%, var(--bg-active))` : 'var(--bg-active)' }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-text-muted">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
              </div>
            </div>
          </Section>
        )}

        {/* Contas Claude */}
        {connectedAccounts.length > 0 && (
          <Section title="Uso das contas Claude" icon={<UserRound size={14} />}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {connectedAccounts.map((a) => {
                const wins = (usageByAccount[a.id] ?? []).filter((w) => ['five_hour', 'seven_day', 'seven_day_sonnet'].includes(w.key));
                const ident = identities[a.id];
                return (
                  <div key={a.id} className="surface-card p-4">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--success-soft)' }}><UserRound size={13} className="text-success" /></span>
                      <span className="flex-1 truncate text-[13px] font-semibold text-text-primary">{a.label}</span>
                      {ident?.planLabel && <span className="rounded px-1.5 text-[9.5px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{ident.planLabel}</span>}
                    </div>
                    {wins.length === 0 ? <p className="text-[11px] text-text-muted">Carregando uso…</p> : wins.map((w) => <UsageBar key={w.key} window={w} />)}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Tarefas + Sessões (7 dias) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="surface-card flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Check size={13} /> Tarefas · 7 dias</span>
              <Delta now={prod.doneWeek} prev={prod.donePrev} fmt={(n) => String(Math.round(n))} />
            </div>
            <BarChart7 bars={prod.doneByDay.map((d) => ({ weekday: d.weekday, value: d.count, label: d.count ? String(d.count) : '' }))}
              max={prod.dayMax} integer colorFor={(t) => t ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 40%, var(--bg-active))'} />
          </div>
          <div className="surface-card flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><History size={13} /> Sessões Claude · 7 dias</span>
              <span className="text-[11px] font-semibold text-text-tertiary">{sessWeek} no total</span>
            </div>
            <BarChart7 bars={week.map((d) => ({ weekday: d.weekday, value: sessionsByDay[d.key] ?? 0, label: (sessionsByDay[d.key] ?? 0) ? String(sessionsByDay[d.key]) : '' }))}
              max={sessMax} integer colorFor={(t) => t ? 'var(--info)' : 'color-mix(in srgb, var(--info) 40%, var(--bg-active))'} />
          </div>
        </div>

        {/* Tempo por projeto + Foco por cliente */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {topProjects.arr.length > 0 && (
            <div className="surface-card p-4">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Folder size={13} /> Tempo por projeto</span>
              <HBars className="mt-3" items={topProjects.arr.map((p) => ({ name: p.name, value: p.ms, color: getProjectColor(p.name).border }))} max={topProjects.max} fmt={fmtDuration} />
            </div>
          )}
          {prod.clients.length > 0 && (
            <div className="surface-card p-4">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Timer size={13} /> Foco por cliente</span>
              <HBars className="mt-3" items={prod.clients.map((c) => ({ name: c.name, value: c.ms, color: c.name === 'Sem cliente' ? 'var(--text-muted)' : getProjectColor(c.name).border }))} max={prod.clientMax} fmt={fmtDuration} />
            </div>
          )}
        </div>

        {/* Comparativo semana vs anterior */}
        <Section title="Esta semana vs. anterior" icon={<TrendingUp size={14} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompareCard label="App aberto" now={usage.weekMs} prev={usage.prevWeekMs} fmt={fmtDuration} />
            <CompareCard label="Foco" now={prod.focusWeek} prev={prod.focusPrev} fmt={fmtDuration} />
            <CompareCard label="Tarefas feitas" now={prod.doneWeek} prev={prod.donePrev} fmt={(n) => String(Math.round(n))} />
            <CompareCard label="Pendentes hoje" now={prod.pending} prev={prod.pending} fmt={(n) => String(Math.round(n))} hideDelta />
          </div>
        </Section>

        {/* Agora */}
        <Section title="Agora" icon={<Sparkles size={14} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi icon={<Server size={15} />} label="Dev rodando" value={String(live.devRunning)} accent={live.devRunning ? 'success' : 'accent'} />
            <Kpi icon={<GitBranch size={15} />} label="Alterações git" value={String(live.gitChanges)} accent={live.gitChanges ? 'warning' : 'accent'} />
            <Kpi icon={<LayoutDashboard size={15} />} label="Abas abertas" value={String(live.tabCount)} accent="accent" />
            <Kpi icon={<Folder size={15} />} label="Projetos" value={String(live.projectCount)} accent="accent" />
            <Kpi icon={<Star size={15} />} label="Favoritos" value={String(live.favCount)} accent="warning" />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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

const ACCENT_COLORS: Record<string, { color: string; soft: string }> = {
  accent: { color: 'var(--accent)', soft: 'var(--accent-soft)' },
  info: { color: 'var(--info)', soft: 'color-mix(in srgb, var(--info) 14%, transparent)' },
  warning: { color: 'var(--warning)', soft: 'var(--warning-soft)' },
  success: { color: 'var(--success)', soft: 'var(--success-soft)' },
};

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  const c = ACCENT_COLORS[accent] ?? ACCENT_COLORS.accent;
  return (
    <div className="surface-card flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: c.soft, color: c.color }}>{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-lg font-extrabold tracking-tight text-text-primary">{value}</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function BigStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-base text-accent">{icon}</span>
      <div className="flex flex-col">
        <span className="text-2xl font-extrabold tracking-tight text-text-primary">{value}</span>
        <span className="text-[11px] text-text-tertiary">{label}</span>
      </div>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return <span className="text-text-tertiary">{label}: <span className="font-bold text-text-primary">{value}</span></span>;
}

function GoalRow({ label, cur, goal, unit, step = 1, onGoal, fmtCur }: {
  label: string; cur: number; goal: number; unit: string; step?: number; onGoal: (v: number) => void; fmtCur: () => string;
}) {
  const pct = goal > 0 ? Math.min(100, (cur / goal) * 100) : 0;
  const done = cur >= goal && goal > 0;
  const color = done ? 'var(--success)' : 'var(--accent)';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
        <span className="font-medium text-text-secondary">{label}</span>
        <span className="flex items-center gap-1 text-text-muted">
          <span className="font-bold text-text-primary">{fmtCur()}</span> /
          <input type="number" min={0} step={step} value={goal} onChange={(e) => onGoal(Math.max(0, Number(e.target.value)))}
            className="w-12 rounded bg-bg-active px-1 py-0.5 text-center text-[11px] text-text-secondary outline-none focus:ring-1 focus:ring-accent" />
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-active">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BarChart7({ bars, max, colorFor, integer }: {
  bars: { weekday: number; value: number; label: string }[]; max: number; colorFor: (isToday: boolean) => string; integer?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-2" style={{ height: 132 }}>
      {bars.map((b, i) => {
        const isToday = i === bars.length - 1;
        const pct = max > 0 ? (b.value / max) * 100 : 0;
        const hasVal = integer ? b.value > 0 : b.value > 60_000;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[9px] font-semibold text-text-tertiary" style={{ opacity: hasVal ? 1 : 0.35 }}>{b.label}</span>
            <div className="flex min-h-0 w-full flex-1 items-end">
              <div className="w-full rounded-md transition-all" style={{ height: `${Math.max(pct, hasVal ? 6 : 2)}%`, minHeight: hasVal ? 6 : 2, background: colorFor(isToday) }} />
            </div>
            <span className="text-[9px] uppercase tracking-wide text-text-muted" style={{ fontWeight: isToday ? 700 : 400 }}>{WEEKDAY[b.weekday]}</span>
          </div>
        );
      })}
    </div>
  );
}

function HBars({ items, max, fmt, className }: { items: { name: string; value: number; color: string }[]; max: number; fmt: (n: number) => string; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className ?? ''}`}>
      {items.map((it) => {
        const pct = max > 0 ? (it.value / max) * 100 : 0;
        return (
          <div key={it.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[12px] font-medium text-text-secondary" title={it.name}>{it.name}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-active">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: it.color }} />
            </div>
            <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-text-tertiary">{fmt(it.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function UsageBar({ window: w }: { window: UsageWindow }) {
  const color = w.utilization >= 95 ? 'var(--danger)' : w.utilization >= 80 ? 'var(--warning)' : 'var(--info)';
  const label = w.key === 'five_hour' ? 'Sessão 5h' : w.key === 'seven_day' ? 'Semana 7d' : 'Semana Sonnet';
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-text-secondary">{label}</span>
        <span className="text-[11.5px] font-bold tabular-nums" style={{ color }}>{Math.round(w.utilization)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-active">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, w.utilization))}%`, background: color }} />
      </div>
    </div>
  );
}

function deltaPct(now: number, prev: number): number | null {
  if (prev <= 0) return now > 0 ? 100 : null;
  return Math.round(((now - prev) / prev) * 100);
}

function Delta({ now, prev, fmt }: { now: number; prev: number; fmt: (n: number) => string }) {
  void fmt;
  const d = deltaPct(now, prev);
  if (d === null) return <span className="text-[11px] text-text-muted">—</span>;
  const up = d > 0, flat = d === 0;
  const color = flat ? 'var(--text-muted)' : up ? 'var(--success)' : 'var(--danger)';
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color }}>
      {flat ? <Minus size={11} /> : up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(d)}%
    </span>
  );
}

function CompareCard({ label, now, prev, fmt, hideDelta }: { label: string; now: number; prev: number; fmt: (n: number) => string; hideDelta?: boolean }) {
  return (
    <div className="surface-card flex flex-col gap-1 px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-extrabold tracking-tight text-text-primary">{fmt(now)}</span>
        {!hideDelta && <Delta now={now} prev={prev} fmt={fmt} />}
      </div>
      {!hideDelta && <span className="text-[10px] text-text-muted">antes: {fmt(prev)}</span>}
    </div>
  );
}
