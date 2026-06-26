import { create } from 'zustand';

/** Uma tarefa simples, ancorada a um dia (YYYY-MM-DD no fuso local). */
export interface Task {
  id: string;
  text: string;
  done: boolean;
  date: string;      // YYYY-MM-DD
  createdAt: number;
  /** Cliente associado (1 por tarefa), digitado como @cliente no texto. */
  client?: string;
  /** Etiquetas, digitadas como #tag no texto. */
  tags?: string[];
  /** Prioridade: 1 (urgente) … 4 (baixa). Digitada como !p1..!p4. */
  priority?: number;
  /** Projeto vinculado (para abrir terminal/dev direto da tarefa). */
  projectPath?: string;
  projectName?: string;
  /** Tempo focado acumulado (ms) via Pomodoro vinculado. */
  timeSpentMs?: number;
  /** Subtarefas (checklist) da tarefa. */
  subtasks?: Subtask[];
  /** Recorrência: ao concluir, gera a próxima ocorrência (diária/semanal). */
  recurrence?: 'daily' | 'weekly';
}

/** Item de checklist dentro de uma tarefa. */
export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface ParsedInput {
  text: string;
  client?: string;
  tags: string[];
  priority?: number;
}

/**
 * Extrai @cliente e #tags do texto livre. O último @ vence (um cliente por
 * tarefa); #tags acumulam (sem duplicar, case-insensitive). Para nomes
 * compostos, use sem espaço (ex.: @AcmeCorp).
 */
export function parseTaskInput(raw: string): ParsedInput {
  const tags: string[] = [];
  let client: string | undefined;
  let priority: number | undefined;
  const cleaned = raw
    .replace(/(^|\s)!p([1-4])\b/gi, (_m, pre: string, n: string) => { priority = Number(n); return pre; })
    .replace(/(^|\s)#([^\s#@]+)/g, (_m, pre: string, tag: string) => { tags.push(tag); return pre; })
    .replace(/(^|\s)@([^\s#@]+)/g, (_m, pre: string, c: string) => { client = c; return pre; })
    .replace(/\s{2,}/g, ' ')
    .trim();
  const seen = new Set<string>();
  const uniqTags = tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { text: cleaned, client, tags: uniqTags, priority };
}

/** Reconstrói o texto editável (texto + @cliente + #tags) a partir da tarefa. */
export function buildRaw(task: Task): string {
  let s = task.text;
  if (task.client) s += ` @${task.client}`;
  for (const t of task.tags ?? []) s += ` #${t}`;
  if (task.priority) s += ` !p${task.priority}`;
  return s;
}

/** Lista única e ordenada de clientes presentes nas tarefas. */
export function allClients(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) if (t.client) set.add(t.client);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Lista única e ordenada de tags presentes nas tarefas. */
export function allTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) for (const tag of t.tags ?? []) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const PERSIST_KEY = 'tasks';

/** Chave de dia (YYYY-MM-DD) no fuso local — comparável lexicograficamente. */
export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toKey(new Date());
}

function newId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Próxima data (YYYY-MM-DD) de uma tarefa recorrente. */
function nextDate(date: string, rec: 'daily' | 'weekly'): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + (rec === 'weekly' ? 7 : 1));
  return toKey(d);
}

/** Pendentes de hoje + atrasadas (date <= hoje e não concluídas). Para o badge. */
export function countPendingToday(tasks: Task[]): number {
  const today = todayKey();
  return tasks.filter((t) => !t.done && t.date <= today).length;
}

interface TasksStore {
  tasks: Task[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (text: string, date: string, project?: { name: string; path: string } | null) => void;
  toggle: (id: string) => void;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  setDate: (id: string, date: string) => void;
  setProject: (id: string, project: { name: string; path: string } | null) => void;
  /** Soma tempo focado (ms) a uma tarefa (vindo do Pomodoro). */
  addTime: (id: string, ms: number) => void;
  clearDone: () => void;
  addSubtask: (taskId: string, text: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  removeSubtask: (taskId: string, subId: string) => void;
  setRecurrence: (taskId: string, rec: 'daily' | 'weekly' | undefined) => void;
}

function persist(tasks: Task[]) {
  void window.api.store.set(PERSIST_KEY, tasks);
}

// Registrado uma única vez: mantém as tarefas em sincronia entre a janela
// principal e a janela flutuante (PiP). O `store:changed` só chega de OUTRAS
// janelas (o main exclui a remetente), então não há loop de escrita.
let synced = false;

export const useTasksStore = create<TasksStore>((set, get) => ({
  tasks: [],
  loaded: false,

  async load() {
    const stored = await window.api.store.get<Task[]>(PERSIST_KEY);
    set({ tasks: Array.isArray(stored) ? stored : [], loaded: true });
    if (!synced) {
      synced = true;
      window.api.store.onChanged((key, value) => {
        if (key === PERSIST_KEY && Array.isArray(value)) {
          set({ tasks: value as Task[] });
        }
      });
    }
  },

  add(text, date, project) {
    const parsed = parseTaskInput(text);
    if (!parsed.text) return;
    const task: Task = {
      id: newId(),
      text: parsed.text,
      done: false,
      date,
      createdAt: Date.now(),
      client: parsed.client,
      tags: parsed.tags.length ? parsed.tags : undefined,
      priority: parsed.priority,
      projectPath: project?.path,
      projectName: project?.name,
    };
    const next = [...get().tasks, task];
    set({ tasks: next });
    persist(next);
  },

  toggle(id) {
    const cur = get().tasks;
    const task = cur.find((t) => t.id === id);
    let next = cur.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    // Recorrência: ao CONCLUIR uma recorrente, gera a próxima ocorrência (pendente).
    if (task && !task.done && task.recurrence) {
      const clone: Task = {
        ...task,
        id: newId(),
        done: false,
        date: nextDate(task.date, task.recurrence),
        createdAt: Date.now(),
        timeSpentMs: undefined,
        subtasks: task.subtasks?.map((s) => ({ ...s, id: newId(), done: false })),
      };
      next = [...next, clone];
    }
    set({ tasks: next });
    persist(next);
  },

  edit(id, text) {
    const parsed = parseTaskInput(text);
    // Texto vazio = remove a tarefa (apaga ao limpar o campo).
    const next = parsed.text
      ? get().tasks.map((x) => (x.id === id
          ? { ...x, text: parsed.text, client: parsed.client, tags: parsed.tags.length ? parsed.tags : undefined, priority: parsed.priority }
          : x))
      : get().tasks.filter((x) => x.id !== id);
    set({ tasks: next });
    persist(next);
  },

  remove(id) {
    const next = get().tasks.filter((t) => t.id !== id);
    set({ tasks: next });
    persist(next);
  },

  setDate(id, date) {
    const next = get().tasks.map((t) => (t.id === id ? { ...t, date } : t));
    set({ tasks: next });
    persist(next);
  },

  setProject(id, project) {
    const next = get().tasks.map((t) => (t.id === id
      ? { ...t, projectPath: project?.path, projectName: project?.name }
      : t));
    set({ tasks: next });
    persist(next);
  },

  addTime(id, ms) {
    if (ms <= 0) return;
    const next = get().tasks.map((t) => (t.id === id
      ? { ...t, timeSpentMs: (t.timeSpentMs ?? 0) + ms }
      : t));
    set({ tasks: next });
    persist(next);
  },

  clearDone() {
    const next = get().tasks.filter((t) => !t.done);
    set({ tasks: next });
    persist(next);
  },

  addSubtask(taskId, text) {
    const t = text.trim();
    if (!t) return;
    const sub: Subtask = { id: newId(), text: t, done: false };
    const next = get().tasks.map((x) => (x.id === taskId
      ? { ...x, subtasks: [...(x.subtasks ?? []), sub] }
      : x));
    set({ tasks: next });
    persist(next);
  },

  toggleSubtask(taskId, subId) {
    const next = get().tasks.map((x) => (x.id === taskId
      ? { ...x, subtasks: (x.subtasks ?? []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) }
      : x));
    set({ tasks: next });
    persist(next);
  },

  removeSubtask(taskId, subId) {
    const next = get().tasks.map((x) => (x.id === taskId
      ? { ...x, subtasks: (x.subtasks ?? []).filter((s) => s.id !== subId) }
      : x));
    set({ tasks: next });
    persist(next);
  },

  setRecurrence(taskId, rec) {
    const next = get().tasks.map((x) => (x.id === taskId ? { ...x, recurrence: rec } : x));
    set({ tasks: next });
    persist(next);
  },
}));
