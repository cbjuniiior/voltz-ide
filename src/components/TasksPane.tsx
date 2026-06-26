import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, Check, Trash2, Plus, AlertTriangle, Eraser, User, X, Hash, PictureInPicture2, Flag, Folder, TerminalSquare, Play, Pause, RotateCcw, SkipForward, Timer, ChevronDown, ChevronLeft, ChevronRight, CalendarDays, ListFilter, Flame, Repeat, ListPlus } from 'lucide-react';
import {
  useTasksStore, todayKey, toKey, buildRaw, allClients, allTags, type Task,
} from '@/stores/tasks';
import { usePomodoroStore, pomodoroRemaining, durationFor } from '@/stores/pomodoro';
import { useProjectsStore } from '@/stores/projects';
import { useDevServersStore } from '@/stores/devServers';
import { openProjectFromTask } from '@/lib/openProject';
import { toast } from '@/stores/toasts';
import { getProjectColor } from '@/lib/projectColors';
import { PanelHeader } from './ui';

/** Rótulo amigável para uma chave de dia (YYYY-MM-DD). */
function dayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'Hoje';
  const d = new Date(key + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

const byCreated = (a: Task, b: Task) => a.createdAt - b.createdAt;

/** Segunda-feira (00:00) da semana que contém `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Estilo de "pill" que funciona em tema claro e escuro: tinta da cor sobre a
 *  superfície atual + texto puxado pro contraste do tema. */
function pillStyle(hex: string, active = false): React.CSSProperties {
  return {
    background: `color-mix(in srgb, ${hex} ${active ? 22 : 12}%, var(--bg-surface))`,
    color: `color-mix(in srgb, ${hex} 76%, var(--text-primary))`,
    border: `1px solid color-mix(in srgb, ${hex} ${active ? 60 : 26}%, transparent)`,
  };
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1min';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// Prioridade: p1 (urgente) … p4 (baixa).
const PRIORITY_TOKENS = ['p1', 'p2', 'p3', 'p4'];
const PRIORITY_LABEL: Record<string, string> = { p1: 'Urgente', p2: 'Alta', p3: 'Média', p4: 'Baixa' };
function priorityColor(n?: number): string {
  switch (n) {
    case 1: return 'var(--danger)';
    case 2: return 'var(--warning)';
    case 3: return 'var(--info)';
    default: return 'var(--text-muted)';
  }
}
/** Sem prioridade vai para o fim. */
const rank = (t: Task) => t.priority ?? 5;

export function TasksView({ pipActive = false, onTogglePip, onClose }: { pipActive?: boolean; onTogglePip?: () => void; onClose?: () => void } = {}) {
  const tasks = useTasksStore((s) => s.tasks);
  const add = useTasksStore((s) => s.add);
  const clearDone = useTasksStore((s) => s.clearDone);
  const setDate = useTasksStore((s) => s.setDate);

  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [addDate, setAddDate] = useState(todayKey());
  const [addProject, setAddProject] = useState<{ name: string; path: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selClients, setSelClients] = useState<Set<string>>(new Set());
  const [selTags, setSelTags] = useState<Set<string>>(new Set());
  const [showPast, setShowPast] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const projectBtnRef = useRef<HTMLButtonElement>(null);

  const today = todayKey();
  const clients = useMemo(() => allClients(tasks), [tasks]);
  const tags = useMemo(() => allTags(tasks), [tasks]);

  function toggleClient(c: string) {
    setSelClients((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }
  function toggleTag(t: string) {
    setSelTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }
  function clearFilters() {
    setSelClients(new Set());
    setSelTags(new Set());
  }

  const { overdue, groups, pastGroups, pendingCount, doneCount, todayDone, todayTotal, focusTodayMs, streak } = useMemo(() => {
    const passes = (t: Task) => {
      if (selClients.size && !(t.client && selClients.has(t.client))) return false;
      if (selTags.size && !((t.tags ?? []).some((tag) => selTags.has(tag)))) return false;
      return true;
    };

    const visible = tasks.filter(passes);

    const overdue = visible
      .filter((t) => !t.done && t.date < today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (rank(a) - rank(b)) || byCreated(a, b)));

    const upcoming = visible.filter((t) => t.date >= today);
    const map = new Map<string, Task[]>();
    for (const t of upcoming) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    const groups = [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) =>
          a.done !== b.done ? (a.done ? 1 : -1) : ((rank(a) - rank(b)) || byCreated(a, b))
        ),
      }));

    // Histórico: dias anteriores (concluídas de date < hoje). As pendentes de
    // dias passados já aparecem em "Atrasadas".
    const pmap = new Map<string, Task[]>();
    for (const t of visible) {
      if (t.date < today && t.done) {
        const arr = pmap.get(t.date) ?? [];
        arr.push(t);
        pmap.set(t.date, arr);
      }
    }
    const pastGroups = [...pmap.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1)) // mais recente primeiro
      .map(([date, items]) => ({ date, items: [...items].sort(byCreated) }));

    // Contadores globais (sem filtro) para o cabeçalho.
    const pendingCount = tasks.filter((t) => !t.done && t.date <= today).length;
    const doneCount = tasks.filter((t) => t.done).length;
    const todayList = tasks.filter((t) => t.date === today);
    const todayTotal = todayList.length;
    const todayDone = todayList.filter((t) => t.done).length;
    const focusTodayMs = todayList.reduce((s, t) => s + (t.timeSpentMs ?? 0), 0);
    // Sequência: dias consecutivos (até hoje) com ao menos 1 tarefa concluída.
    // Hoje em andamento não quebra a sequência (conta a partir de ontem se hoje vazio).
    const doneDays = new Set(tasks.filter((t) => t.done).map((t) => t.date));
    let streak = 0;
    const sd = new Date();
    if (!doneDays.has(toKey(sd))) sd.setDate(sd.getDate() - 1);
    while (doneDays.has(toKey(sd))) { streak++; sd.setDate(sd.getDate() - 1); }
    return { overdue, groups, pastGroups, pendingCount, doneCount, todayDone, todayTotal, focusTodayMs, streak };
  }, [tasks, today, selClients, selTags]);

  function submit() {
    if (!text.trim()) return;
    add(text, addDate, addProject);
    setText('');
    addInputRef.current?.focus();
  }

  const isEmpty = tasks.length === 0;
  const nothingMatches = !isEmpty && overdue.length === 0 && groups.length === 0;

  return (
    <div className="flex h-full flex-col bg-bg-base">
      <PanelHeader
        icon={<ListChecks size={14} />}
        title="Tarefas"
        subtitle={pendingCount === 0 ? 'Tudo em dia ✨' : `${pendingCount} pendente${pendingCount > 1 ? 's' : ''} pra hoje`}
        actions={
          <>
            {doneCount > 0 && (
              <button
                onClick={clearDone}
                title="Remover todas as tarefas concluídas"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Eraser size={11} /> Limpar
              </button>
            )}
            {onTogglePip && (
              <button
                onClick={onTogglePip}
                title={pipActive ? 'Fechar janela flutuante' : 'Abrir em janela flutuante (sempre no topo)'}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors hover:bg-bg-hover"
                style={{ color: pipActive ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                <PictureInPicture2 size={12} /> {pipActive ? 'Fechar' : 'Janela'}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                title="Fechar (Esc)"
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={14} />
              </button>
            )}
          </>
        }
      />

      {/* Planejador da semana */}
      <WeekStrip tasks={tasks} selectedDate={addDate} onPickDate={setAddDate} />

      {/* Resumo do dia */}
      <DaySummary done={todayDone} total={todayTotal} pending={pendingCount} focusMs={focusTodayMs} streak={streak} />

      {/* Timer Pomodoro */}
      <PomodoroTimer />

      {/* Composer — adicionar tarefa */}
      <div className="px-3 py-3">
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-2.5 transition-all focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <TaskTextInput
            inputRef={addInputRef}
            value={text}
            onChange={setText}
            onSubmit={submit}
            clients={clients}
            tags={tags}
            placeholder="Nova tarefa…  #tag  @cliente  !p1"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <label className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary transition-colors focus-within:border-accent hover:border-border-default">
              <CalendarDays size={12} className="text-text-muted" />
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value || todayKey())}
                title="Dia da tarefa"
                className="bg-transparent text-[11px] text-text-secondary outline-none [color-scheme:dark]"
              />
            </label>
            <button
              ref={projectBtnRef}
              onClick={() => setPickerOpen((v) => !v)}
              title={addProject ? `Projeto: ${addProject.name}` : 'Vincular a um projeto'}
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors hover:border-border-default"
              style={{
                borderColor: addProject ? 'var(--accent)' : 'var(--border-subtle)',
                color: addProject ? 'var(--accent)' : 'var(--text-muted)',
                background: 'var(--bg-base)',
              }}
            >
              <Folder size={13} />
            </button>
            <button
              onClick={submit}
              disabled={!text.trim()}
              title="Adicionar tarefa (Enter)"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                boxShadow: '0 2px 10px -3px color-mix(in srgb, var(--accent) 65%, transparent)',
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          {addProject && (
            <div className="mt-2 flex">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={pillStyle(getProjectColor(addProject.name).border)}
              >
                <Folder size={9} /> {addProject.name}
                <button onClick={() => setAddProject(null)} title="Remover vínculo" className="ml-0.5 opacity-70 hover:opacity-100">
                  <X size={10} />
                </button>
              </span>
            </div>
          )}
        </div>
        {pickerOpen && projectBtnRef.current && (
          <ProjectPicker
            anchor={projectBtnRef.current}
            currentPath={addProject?.path}
            onPick={(p) => setAddProject(p)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* Filtros */}
      {(clients.length > 0 || tags.length > 0) && (
        <FilterBar
          clients={clients}
          tags={tags}
          selClients={selClients}
          selTags={selTags}
          onToggleClient={toggleClient}
          onToggleTag={toggleTag}
          onClear={clearFilters}
        />
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {isEmpty && (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border-default px-4 py-12 text-center">
            <div className="mb-3 rounded-2xl p-3" style={{ background: 'var(--accent-soft)' }}>
              <ListChecks size={22} className="text-accent" />
            </div>
            <p className="text-[12.5px] font-medium text-text-secondary">Nenhuma tarefa ainda</p>
            <p className="mt-1.5 max-w-[220px] text-[10.5px] leading-relaxed text-text-muted">
              Adicione acima. Use <span className="rounded bg-bg-active px-1 font-mono text-text-tertiary">#tag</span>, <span className="rounded bg-bg-active px-1 font-mono text-text-tertiary">@cliente</span> e <span className="rounded bg-bg-active px-1 font-mono text-text-tertiary">!p1</span> no texto.
            </p>
          </div>
        )}

        {nothingMatches && !isEmpty && (
          <div className="px-2 py-10 text-center text-[11px] text-text-muted">
            Nada bate com o filtro.
          </div>
        )}

        {/* Atrasadas */}
        {overdue.length > 0 && (
          <div className="mb-5">
            <SectionHeader
              label="Atrasadas"
              count={overdue.length}
              color="var(--danger)"
              icon={<AlertTriangle size={11} />}
            />
            <div className="space-y-0.5">
              {overdue.map((t) => (
                <TaskItem key={t.id} task={t} overdue clients={clients} tags={tags}
                  onToggleClient={toggleClient} onToggleTag={toggleTag} />
              ))}
            </div>
          </div>
        )}

        {/* Por dia (hoje em diante) */}
        {groups.map((g) => {
          const isToday = g.date === today;
          const dDone = g.items.filter((t) => t.done).length;
          return (
            <div
              key={g.date}
              className="mb-5 rounded-xl p-1 transition-colors"
              onDragOver={(e) => { if (e.dataTransfer.types.includes('application/voltz-task')) { e.preventDefault(); setDragOverDate(g.date); } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverDate(null); }}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('application/voltz-task'); if (id) setDate(id, g.date); setDragOverDate(null); }}
              style={dragOverDate === g.date ? { background: 'var(--accent-soft)', boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent)' } : undefined}
            >
              <SectionHeader
                label={dayLabel(g.date)}
                count={g.items.length ? `${dDone}/${g.items.length}` : undefined}
                color={isToday ? 'var(--accent)' : 'var(--text-muted)'}
                icon={isToday ? undefined : <CalendarDays size={10} />}
              />
              <div className="space-y-0.5">
                {g.items.map((t) => (
                  <TaskItem key={t.id} task={t} clients={clients} tags={tags}
                    onToggleClient={toggleClient} onToggleTag={toggleTag} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Dias anteriores (histórico de concluídas) */}
        {pastGroups.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowPast((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
            >
              <ChevronDown size={13} className="transition-transform" style={{ transform: showPast ? 'none' : 'rotate(-90deg)' }} />
              Dias anteriores
              <span className="rounded-full bg-bg-active px-1.5 py-px text-[9px] font-bold normal-case text-text-tertiary">{pastGroups.length}</span>
            </button>
            {showPast && (
              <div className="mt-1.5">
                {pastGroups.map((g) => (
                  <div key={g.date} className="mb-4">
                    <SectionHeader label={dayLabel(g.date)} color="var(--text-muted)" />
                    <div className="space-y-0.5">
                      {g.items.map((t) => (
                        <TaskItem key={t.id} task={t} clients={clients} tags={tags}
                          onToggleClient={toggleClient} onToggleTag={toggleTag} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Planejador da semana: 7 dias (seg–dom) com contagem; clica p/ escolher o dia da nova tarefa. */
function WeekStrip({ tasks, selectedDate, onPickDate }: {
  tasks: Task[];
  selectedDate: string;
  onPickDate: (d: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const today = todayKey();

  const { days, monthLabel } = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + offset * 7);
    const start = startOfWeek(base);
    const ds = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(start);
    return { days: ds, monthLabel: label };
  }, [offset]);

  const countByDay = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      const e = m.get(t.date) ?? { total: 0, done: 0 };
      e.total++;
      if (t.done) e.done++;
      m.set(t.date, e);
    }
    return m;
  }, [tasks]);

  const DOW = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  return (
    <div className="px-3 pt-2.5">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted" style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setOffset((o) => o - 1)} title="Semana anterior" className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><ChevronLeft size={13} /></button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="rounded px-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-bg-hover">hoje</button>
          )}
          <button onClick={() => setOffset((o) => o + 1)} title="Próxima semana" className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><ChevronRight size={13} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const key = toKey(d);
          const isToday = key === today;
          const isSel = key === selectedDate;
          const c = countByDay.get(key);
          const pending = c ? c.total - c.done : 0;
          return (
            <button
              key={key}
              onClick={() => onPickDate(key)}
              title={c ? `${c.total} tarefa(s) · ${c.done} feita(s)` : 'Sem tarefas — clique para planejar aqui'}
              className="flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors hover:bg-bg-hover"
              style={isSel ? { background: 'var(--accent-soft)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent)' } : undefined}
            >
              <span className="text-[8.5px] font-bold uppercase" style={{ color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>{DOW[i]}</span>
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
                style={isToday ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--text-secondary)' }}
              >
                {d.getDate()}
              </span>
              <span className="flex h-[13px] items-center justify-center">
                {c && c.total > 0 && (
                  <span
                    className="rounded-full px-1 text-[8px] font-bold leading-[13px] tabular-nums"
                    style={{
                      background: pending > 0 ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'color-mix(in srgb, var(--success) 22%, transparent)',
                      color: pending > 0 ? 'var(--accent)' : 'var(--success)',
                    }}
                  >
                    {pending > 0 ? c.total : '✓'}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Resumo do dia: anel de progresso + stats inline (sem grade de cards). */
function DaySummary({ done, total, pending, focusMs, streak }: {
  done: number; total: number; pending: number; focusMs: number; streak: number;
}) {
  const pct = total > 0 ? done / total : 0;
  const R = 16;
  const CIRC = 2 * Math.PI * R;
  const allDone = total > 0 && done === total;
  const ring = allDone ? 'var(--success)' : 'var(--accent)';
  const headline = total === 0 ? 'Dia livre' : allDone ? 'Dia concluído 🎉' : `${pending} pra fazer`;
  return (
    <div className="mx-3 mt-1.5 flex items-center gap-3.5 rounded-2xl border border-border-subtle bg-bg-surface px-3.5 py-2.5">
      {/* Anel de progresso do dia */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="20" cy="20" r={R} fill="none" stroke="var(--bg-active)" strokeWidth="3.5" />
          <circle
            cx="20" cy="20" r={R} fill="none" stroke={ring} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        {allDone ? (
          <Check size={18} strokeWidth={3} style={{ color: 'var(--success)' }} />
        ) : (
          <div className="flex items-baseline gap-px leading-none">
            <span className="text-[14px] font-bold tabular-nums text-text-primary">{done}</span>
            <span className="text-[10px] tabular-nums text-text-muted">/{total}</span>
          </div>
        )}
      </div>

      {/* Stats inline */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12.5px] font-bold text-text-primary">{headline}</span>
          {streak > 0 && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--warning)' }}
              title="Dias seguidos concluindo tarefas"
            >
              <Flame size={11} /> {streak}d
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
          <span className="flex items-center gap-1" title="Concluídas hoje"><Check size={11} style={{ color: 'var(--success)' }} /> {done}</span>
          <span className="h-3 w-px bg-border-subtle" />
          <span className="flex items-center gap-1" title="Pendentes"><ListChecks size={11} style={{ color: 'var(--accent)' }} /> {pending}</span>
          <span className="h-3 w-px bg-border-subtle" />
          <span className="flex items-center gap-1" style={{ color: focusMs > 0 ? 'var(--text-secondary)' : undefined }} title="Tempo focado hoje">
            <Timer size={11} style={{ color: 'var(--info)' }} /> {focusMs > 0 ? formatDuration(focusMs) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Cabeçalho de seção: rótulo + badge de contagem + linha divisória. */
function SectionHeader({
  label, count, color, icon,
}: {
  label: string;
  count?: string | number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
        {icon}{label}
      </span>
      {count != null && (
        <span
          className="rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
        >
          {count}
        </span>
      )}
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, var(--border-subtle), transparent)' }}
      />
    </div>
  );
}

/** Filtro multi-select: trigger limpo + dropdown com clientes/tags, mais os
 *  filtros ativos removíveis ao lado. Mantém a barra enxuta. */
function FilterBar({
  clients, tags, selClients, selTags, onToggleClient, onToggleTag, onClear,
}: {
  clients: string[];
  tags: string[];
  selClients: Set<string>;
  selTags: Set<string>;
  onToggleClient: (c: string) => void;
  onToggleTag: (t: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const activeCount = selClients.size + selTags.size;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.max(r.width, 220);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left: Math.max(8, left), top: r.bottom + 6, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="px-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
          style={{
            borderColor: open || activeCount > 0 ? 'var(--accent)' : 'var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: activeCount > 0 ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          <ListFilter size={13} />
          Filtrar
          {activeCount > 0 && (
            <span
              className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown size={12} className="opacity-60 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>

        {/* Filtros ativos — removíveis */}
        {[...selClients].map((c) => (
          <ActiveFilterChip key={`ac-${c}`} label={c} icon={<User size={9} />} color={getProjectColor(c)} onRemove={() => onToggleClient(c)} />
        ))}
        {[...selTags].map((t) => (
          <ActiveFilterChip key={`at-${t}`} label={`#${t}`} color={getProjectColor(t)} onRemove={() => onToggleTag(t)} />
        ))}
        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-text-muted transition-colors hover:text-text-primary"
          >
            limpar
          </button>
        )}
      </div>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[300] overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: 360 }}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Filtrar tarefas</span>
            {activeCount > 0 && (
              <button onClick={onClear} className="flex items-center gap-0.5 text-[10px] text-text-muted transition-colors hover:text-text-primary">
                <X size={10} /> limpar
              </button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto p-2.5">
            {clients.length > 0 && (
              <div className="mb-2.5">
                <div className="mb-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">Clientes</div>
                <div className="flex flex-wrap gap-1">
                  {clients.map((c) => (
                    <Chip key={`fc-${c}`} label={c} icon={<User size={9} />} color={getProjectColor(c)}
                      active={selClients.has(c)} onClick={() => onToggleClient(c)} />
                  ))}
                </div>
              </div>
            )}
            {tags.length > 0 && (
              <div>
                <div className="mb-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Chip key={`ft-${t}`} label={`#${t}`} color={getProjectColor(t)}
                      active={selTags.has(t)} onClick={() => onToggleTag(t)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Chip de filtro ativo (com botão de remover). */
function ActiveFilterChip({
  label, icon, color, onRemove,
}: {
  label: string;
  icon?: React.ReactNode;
  color: { bg: string; border: string; text: string };
  onRemove: () => void;
}) {
  return (
    <span
      className="flex max-w-[140px] items-center gap-1 rounded-full py-0.5 pl-1.5 pr-1 text-[10px] font-medium leading-none"
      style={pillStyle(color.border, true)}
      title={label}
    >
      {icon}
      <span className="truncate">{label}</span>
      <button onClick={onRemove} title="Remover filtro" className="ml-0.5 opacity-70 transition-opacity hover:opacity-100">
        <X size={10} />
      </button>
    </span>
  );
}

function PomodoroTimer() {
  const phase = usePomodoroStore((s) => s.phase);
  const running = usePomodoroStore((s) => s.running);
  const endsAt = usePomodoroStore((s) => s.endsAt);
  const remaining = usePomodoroStore((s) => s.remaining);
  const cycles = usePomodoroStore((s) => s.cycles);
  const taskId = usePomodoroStore((s) => s.taskId);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const reset = usePomodoroStore((s) => s.reset);
  const skip = usePomodoroStore((s) => s.skip);
  const clearTask = usePomodoroStore((s) => s.clearTask);
  const linkedTask = useTasksStore((s) => (taskId ? s.tasks.find((t) => t.id === taskId) : undefined));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const ms = pomodoroRemaining({ running, endsAt, remaining }, now);
  const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const isFocus = phase === 'focus';
  const color = isFocus ? 'var(--accent)' : 'var(--success)';
  const total = durationFor(phase);
  const pct = total > 0 ? Math.min(100, Math.max(0, (1 - ms / total) * 100)) : 0;
  const atStart = ms >= total - 1000;

  // Ocioso (sem rodar, sem tarefa, no início da fase): barra compacta — economiza
  // espaço vertical; expande sozinho ao iniciar ou vincular uma tarefa.
  if (!running && !linkedTask && atStart) {
    return (
      <div className="px-3 pt-1.5">
        <button
          onClick={start}
          className="group/pomo flex w-full items-center gap-2.5 rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 transition-colors hover:border-border-default"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
          >
            <Timer size={14} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Foco</span>
          <span className="font-mono text-[15px] font-bold tabular-nums text-text-secondary">{mm}:{ss}</span>
          {cycles > 0 && <span className="text-[10px] text-text-muted" title="Pomodoros concluídos">🍅 {cycles}</span>}
          <span
            className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-white transition-all group-hover/pomo:brightness-110"
            style={{ background: 'var(--accent)', boxShadow: '0 2px 8px -3px color-mix(in srgb, var(--accent) 60%, transparent)' }}
          >
            <Play size={12} fill="currentColor" /> Iniciar
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-1">
      <div
        className="relative overflow-hidden rounded-xl border p-3"
        style={{
          borderColor: `color-mix(in srgb, ${color} ${running ? 45 : 22}%, transparent)`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, var(--bg-surface)) 0%, var(--bg-surface) 70%)`,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Selo da fase */}
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
          >
            <Timer size={17} className={running ? 'claude-dot' : ''} />
          </span>

          {/* Tempo + label */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                {isFocus ? 'Foco' : 'Pausa'}
              </span>
              {cycles > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-text-muted" title="Pomodoros concluídos">
                  🍅 {cycles}
                </span>
              )}
            </div>
            <div className="font-mono text-[26px] font-bold leading-none tabular-nums text-text-primary">
              {mm}:{ss}
            </div>
          </div>

          {/* Controles */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={running ? pause : start}
              title={running ? 'Pausar' : 'Iniciar'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: color, boxShadow: `0 2px 10px -3px color-mix(in srgb, ${color} 70%, transparent)` }}
            >
              {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </button>
            <button onClick={reset} title="Reiniciar fase" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">
              <RotateCcw size={14} />
            </button>
            <button onClick={skip} title="Pular fase (foco ⇄ pausa)" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">
              <SkipForward size={14} />
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-bg-active">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>

        {/* Tarefa vinculada */}
        {linkedTask && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-bg-base/60 px-2 py-1 text-[11px]">
            <Timer size={10} style={{ color }} className="shrink-0" />
            <span className="flex-1 truncate text-text-secondary" title={linkedTask.text}>{linkedTask.text}</span>
            {(linkedTask.timeSpentMs ?? 0) > 0 && (
              <span className="shrink-0 tabular-nums text-text-muted">{formatDuration(linkedTask.timeSpentMs ?? 0)}</span>
            )}
            <button onClick={clearTask} title="Desvincular tarefa" className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
              <X size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mostrado na sidebar enquanto as tarefas estão numa janela flutuante (PiP). */
export function TasksPipPlaceholder({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-xl p-3" style={{ background: 'var(--accent-soft)' }}>
        <PictureInPicture2 size={22} className="text-accent" />
      </div>
      <p className="text-[12px] leading-relaxed text-text-secondary">
        Tarefas abertas em<br />janela flutuante
      </p>
      <button
        onClick={onReturn}
        className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        Trazer de volta
      </button>
    </div>
  );
}

// ============================================================================
// Input com autocomplete de @cliente / #tag
// ============================================================================

interface ActiveToken { type: '@' | '#' | '!'; query: string; start: number; end: number; }

/** Detecta se o cursor está dentro de um token @…, #… ou !… sendo digitado. */
function getActiveToken(text: string, caret: number): ActiveToken | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n') return null;
    if (ch === '@' || ch === '#' || ch === '!') {
      const prev = i > 0 ? text[i - 1] : ' ';
      if (i === 0 || prev === ' ' || prev === '\n') {
        let j = caret;
        while (j < text.length && text[j] !== ' ' && text[j] !== '\n') j++;
        return { type: ch, query: text.slice(i + 1, caret), start: i, end: j };
      }
      return null;
    }
    i--;
  }
  return null;
}

export function TaskTextInput({
  value, onChange, onSubmit, onEscape, onBlur, clients, tags, placeholder, autoFocus, inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  clients: string[];
  tags: string[];
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const innerRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? innerRef;
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissStart, setDismissStart] = useState<number | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const token = useMemo(() => getActiveToken(value, caret), [value, caret]);
  const items = useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    if (token.type === '!') return PRIORITY_TOKENS.filter((p) => p.includes(q));
    const pool = token.type === '@' ? clients : tags;
    return pool.filter((x) => x.toLowerCase().includes(q)).slice(0, 8);
  }, [token, clients, tags]);

  const open = !!token && items.length > 0 && dismissStart !== token.start;

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  }, [open, value, caret, ref]);

  useEffect(() => { setHighlight(0); }, [token?.start, items.length]);

  function syncCaret() {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }

  function choose(val: string) {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    const insert = `${token.type}${val} `;
    const trimmedAfter = after.startsWith(' ') ? after.slice(1) : after;
    const nv = before + insert + trimmedAfter;
    onChange(nv);
    setDismissStart(token.start);
    const p = (before + insert).length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(p, p); setCaret(p); }
    });
  }

  return (
    <>
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setDismissStart(null); requestAnimationFrame(syncCaret); }}
        onClick={syncCaret}
        onKeyUp={syncCaret}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % items.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + items.length) % items.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(items[highlight]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setDismissStart(token!.start); return; }
          } else {
            if (e.key === 'Enter') { onSubmit?.(); }
            else if (e.key === 'Escape') { onEscape?.(); }
          }
        }}
        className="w-full bg-transparent px-1.5 py-1 text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
      />
      {open && pos && createPortal(
        <div
          className="overflow-hidden rounded-lg border border-border-default bg-bg-overlay py-1 shadow-lg"
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: Math.max(pos.width, 160), zIndex: 300 }}
        >
          <div className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
            {token!.type === '@' ? 'Clientes' : token!.type === '#' ? 'Tags' : 'Prioridade'}
          </div>
          {items.map((it, idx) => {
            const isPrio = token!.type === '!';
            const c = getProjectColor(it);
            return (
              <button
                key={it}
                onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                onMouseEnter={() => setHighlight(idx)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors"
                style={{ background: highlight === idx ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-secondary)' }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                  style={isPrio ? { color: priorityColor(Number(it[1])) } : { background: c.bg, color: c.text }}>
                  {isPrio ? <Flag size={10} fill="currentColor" /> : token!.type === '@' ? <User size={10} /> : <Hash size={10} />}
                </span>
                <span className="truncate">{isPrio ? `${it} · ${PRIORITY_LABEL[it]}` : it}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ============================================================================
// Item de tarefa
// ============================================================================

function TaskItem({
  task, overdue = false, clients, tags, onToggleClient, onToggleTag,
}: {
  task: Task;
  overdue?: boolean;
  clients: string[];
  tags: string[];
  onToggleClient: (c: string) => void;
  onToggleTag: (t: string) => void;
}) {
  const toggle = useTasksStore((s) => s.toggle);
  const edit = useTasksStore((s) => s.edit);
  const remove = useTasksStore((s) => s.remove);
  const setDate = useTasksStore((s) => s.setDate);
  const setProject = useTasksStore((s) => s.setProject);
  const addSubtask = useTasksStore((s) => s.addSubtask);
  const toggleSubtask = useTasksStore((s) => s.toggleSubtask);
  const removeSubtask = useTasksStore((s) => s.removeSubtask);
  const setRecurrence = useTasksStore((s) => s.setRecurrence);
  const startDev = useDevServersStore((s) => s.start);
  const startFor = usePomodoroStore((s) => s.startFor);
  const pausePomo = usePomodoroStore((s) => s.pause);
  const pomoTaskId = usePomodoroStore((s) => s.taskId);
  const pomoRunning = usePomodoroStore((s) => s.running);
  const pomoPhase = usePomodoroStore((s) => s.phase);
  const isActive = pomoTaskId === task.id;
  const isFocusing = isActive && pomoRunning && pomoPhase === 'focus';

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [projPickerOpen, setProjPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [subInput, setSubInput] = useState('');
  const [recurOpen, setRecurOpen] = useState(false);
  const projChipRef = useRef<HTMLButtonElement>(null);
  const recurRef = useRef<HTMLButtonElement>(null);
  const subs = task.subtasks ?? [];
  const subDone = subs.filter((s) => s.done).length;

  function startEdit() {
    setValue(buildRaw(task));
    setEditing(true);
  }
  function commit() {
    if (!editing) return;
    setEditing(false);
    edit(task.id, value);
  }

  const hasChips = !!task.client || (task.tags?.length ?? 0) > 0;
  const prioClr = task.priority ? priorityColor(task.priority) : null;

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.setData('application/voltz-task', task.id); e.dataTransfer.effectAllowed = 'move'; }}
      className="group relative flex flex-col rounded-xl py-1.5 pl-3 pr-1.5 transition-colors hover:bg-bg-surface"
      style={isActive ? { background: 'color-mix(in srgb, var(--accent) 7%, transparent)' } : undefined}
    >
      {/* Barra de prioridade */}
      {prioClr && !task.done && (
        <span
          className="absolute bottom-2 left-0.5 top-2 w-[3px] rounded-full"
          style={{ background: prioClr }}
          title={`Prioridade ${task.priority} · ${PRIORITY_LABEL['p' + task.priority]}`}
        />
      )}

      <div className="flex items-center gap-2.5">
        {/* Checkbox redondo */}
        <button
          onClick={() => toggle(task.id)}
          title={task.done ? 'Marcar como pendente' : 'Marcar como feita'}
          className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-105"
          style={{
            background: task.done ? 'var(--accent)' : 'transparent',
            borderColor: task.done ? 'var(--accent)' : prioClr ?? 'var(--border-default)',
          }}
        >
          {task.done && <Check size={11} strokeWidth={3} style={{ color: 'var(--accent-fg)' }} />}
        </button>

        {/* Texto / edição inline */}
        {editing ? (
          <div className="flex-1 rounded-lg border border-border-subtle bg-bg-base px-1.5 py-0.5 focus-within:border-accent">
            <TaskTextInput
              value={value}
              onChange={setValue}
              onSubmit={commit}
              onEscape={() => setEditing(false)}
              onBlur={commit}
              clients={clients}
              tags={tags}
              autoFocus
            />
          </div>
        ) : (
          <span
            onDoubleClick={startEdit}
            title="Duplo-clique para editar (nome, @cliente e #tags)"
            className="flex-1 cursor-text truncate text-[12.5px] leading-snug"
            style={{
              color: task.done ? 'var(--text-muted)' : 'var(--text-secondary)',
              textDecoration: task.done ? 'line-through' : undefined,
            }}
          >
            {task.text}
          </span>
        )}

        {/* Indicador de subtarefas */}
        {!editing && subs.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            title="Ver subtarefas"
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors hover:bg-bg-active"
            style={{ color: subDone === subs.length ? 'var(--success)' : 'var(--text-muted)' }}
          >
            <ListChecks size={11} /> {subDone}/{subs.length}
          </button>
        )}
        {/* Indicador de recorrência */}
        {!editing && task.recurrence && (
          <span
            title={`Repete ${task.recurrence === 'daily' ? 'diariamente' : 'semanalmente'}`}
            className="flex shrink-0 items-center text-accent"
          >
            <Repeat size={11} />
          </span>
        )}

        {/* Tempo focado acumulado */}
        {!editing && (task.timeSpentMs ?? 0) > 0 && (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
            title="Tempo focado (Pomodoro)"
          >
            <Timer size={9} /> {formatDuration(task.timeSpentMs ?? 0)}
          </span>
        )}

        {/* Botão de foco (Pomodoro) */}
        {!editing && !task.done && (
          <button
            onClick={() => (isFocusing ? pausePomo() : startFor(task.id))}
            title={isFocusing ? 'Pausar foco' : 'Focar nesta tarefa (Pomodoro)'}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-bg-active ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {isFocusing ? <Pause size={12} fill="currentColor" className="claude-dot" /> : <Timer size={13} />}
          </button>
        )}

        {/* Ações no hover */}
        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {overdue && (
              <button
                onClick={() => setDate(task.id, todayKey())}
                title="Mover para hoje"
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-accent transition-colors hover:bg-bg-active"
              >
                → hoje
              </button>
            )}
            <button
              onClick={() => setExpanded(true)}
              title="Adicionar subtarefa"
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
            >
              <ListPlus size={13} />
            </button>
            <button
              ref={recurRef}
              onClick={() => setRecurOpen((v) => !v)}
              title="Repetir tarefa (diária/semanal)"
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-bg-active"
              style={{ color: task.recurrence ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Repeat size={13} />
            </button>
            <button
              onClick={() => remove(task.id)}
              title="Excluir tarefa"
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Projeto + chips de cliente/tags */}
      {!editing && (task.projectName || hasChips) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[29px]">
          {task.projectName && task.projectPath && (() => {
            const pc = getProjectColor(task.projectName);
            return (
              <span
                className="inline-flex items-center overflow-hidden rounded-full border"
                style={pillStyle(pc.border)}
              >
                <button
                  ref={projChipRef}
                  onClick={() => setProjPickerOpen(true)}
                  title="Trocar / desvincular projeto"
                  className="flex max-w-[120px] items-center gap-1 py-0.5 pl-1.5 pr-1 text-[10px] font-medium"
                >
                  <Folder size={9} /> <span className="truncate">{task.projectName}</span>
                </button>
                <button
                  onClick={() => openProjectFromTask(task.projectName!, task.projectPath!)}
                  title="Abrir terminal do projeto"
                  className="flex h-[18px] w-5 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
                >
                  <TerminalSquare size={10} />
                </button>
                <button
                  onClick={() => { startDev(task.projectPath!); toast.info('Iniciando dev server', task.projectName!); }}
                  title="Rodar dev server do projeto"
                  className="flex h-[18px] w-5 items-center justify-center pr-0.5 opacity-70 transition-opacity hover:opacity-100"
                >
                  <Play size={9} fill="currentColor" />
                </button>
              </span>
            );
          })()}
          {task.client && (
            <Chip label={task.client} icon={<User size={9} />} color={getProjectColor(task.client)}
              onClick={() => onToggleClient(task.client!)} />
          )}
          {(task.tags ?? []).map((t) => (
            <Chip key={t} label={`#${t}`} color={getProjectColor(t)} onClick={() => onToggleTag(t)} />
          ))}
        </div>
      )}

      {/* Subtarefas (checklist) */}
      {!editing && expanded && (
        <div className="mt-2 flex flex-col gap-1.5 pl-[29px]">
          {subs.length > 0 && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-bg-active">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${subs.length ? (subDone / subs.length) * 100 : 0}%`,
                  background: subDone === subs.length && subs.length ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>
          )}
          {subs.map((s) => (
            <div key={s.id} className="group/sub flex items-center gap-2">
              <button
                onClick={() => toggleSubtask(task.id, s.id)}
                className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border transition-all hover:scale-110"
                style={{ background: s.done ? 'var(--accent)' : 'transparent', borderColor: s.done ? 'var(--accent)' : 'var(--border-default)' }}
              >
                {s.done && <Check size={9} strokeWidth={3} style={{ color: 'var(--accent-fg)' }} />}
              </button>
              <span
                className="flex-1 truncate text-[11.5px] leading-snug"
                style={{ color: s.done ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: s.done ? 'line-through' : undefined }}
              >
                {s.text}
              </span>
              <button
                onClick={() => removeSubtask(task.id, s.id)}
                title="Remover subtarefa"
                className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/sub:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-border-default text-text-muted">
              <Plus size={9} />
            </span>
            <input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && subInput.trim()) { addSubtask(task.id, subInput); setSubInput(''); }
                else if (e.key === 'Escape') { setSubInput(''); if (subs.length === 0) setExpanded(false); }
              }}
              placeholder="Adicionar subtarefa…"
              autoFocus={subs.length === 0}
              className="flex-1 bg-transparent text-[11.5px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
      )}

      {projPickerOpen && projChipRef.current && (
        <ProjectPicker
          anchor={projChipRef.current}
          currentPath={task.projectPath}
          onPick={(p) => setProject(task.id, p)}
          onClose={() => setProjPickerOpen(false)}
        />
      )}

      {recurOpen && recurRef.current && (
        <RecurrenceMenu
          anchor={recurRef.current}
          value={task.recurrence}
          onPick={(r) => { setRecurrence(task.id, r); setRecurOpen(false); }}
          onClose={() => setRecurOpen(false)}
        />
      )}
    </div>
  );
}

/** Menu pop-over de recorrência: Não repetir / Diária / Semanal. */
function RecurrenceMenu({ anchor, value, onPick, onClose }: {
  anchor: HTMLElement;
  value?: 'daily' | 'weekly';
  onPick: (r: 'daily' | 'weekly' | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const width = 168;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 4 });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  const opts: { key: 'daily' | 'weekly' | undefined; label: string }[] = [
    { key: undefined, label: 'Não repetir' },
    { key: 'daily', label: 'Diariamente' },
    { key: 'weekly', label: 'Semanalmente' },
  ];
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[300] overflow-hidden rounded-lg border border-border-default bg-bg-overlay py-1 shadow-lg"
      style={{ left: pos.left, top: pos.top, width: 168 }}
    >
      <div className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">Repetir tarefa</div>
      {opts.map((o) => {
        const active = (value ?? undefined) === o.key;
        return (
          <button
            key={o.label}
            onMouseDown={(e) => { e.preventDefault(); onPick(o.key); }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-hover"
            style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Repeat size={12} className={o.key ? '' : 'opacity-40'} />
            <span className="flex-1">{o.label}</span>
            {active && <Check size={12} />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function ProjectPicker({
  anchor, currentPath, onPick, onClose,
}: {
  anchor: HTMLElement;
  currentPath?: string;
  onPick: (p: { name: string; path: string } | null) => void;
  onClose: () => void;
}) {
  const projects = useProjectsStore((s) => s.projects);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const width = 240;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left: Math.max(8, left), top: r.bottom + 4, width });
  }, [anchor]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  const filtered = projects.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[300] flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-overlay shadow-lg"
      style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: 320 }}
    >
      <div className="border-b border-border-subtle p-2">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar projeto…"
          className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div className="overflow-y-auto py-1">
        {currentPath && (
          <button
            onMouseDown={(e) => { e.preventDefault(); onPick(null); onClose(); }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-danger transition-colors hover:bg-bg-hover"
          >
            <X size={12} /> Desvincular projeto
          </button>
        )}
        {filtered.map((p) => {
          const c = getProjectColor(p.name);
          return (
            <button
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); onPick({ name: p.name, path: p.path }); onClose(); }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-hover"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white" style={{ background: c.badge }}>
                {p.name[0].toUpperCase()}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2.5 py-3 text-center text-[11px] text-text-muted">Nenhum projeto</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Chip({
  label, icon, color, active = false, onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  color: { bg: string; border: string; text: string };
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex max-w-[140px] items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors"
      style={pillStyle(color.border, active)}
      title={label}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
