import { create } from 'zustand';
import { toKey } from './tasks';
import { useWorkspaceStore } from './workspace';
import { collectLeaves } from '@/lib/layoutTree';

export interface UsageGoals {
  /** Meta de tempo de app aberto por dia (minutos). */
  appMin: number;
  /** Meta de foco (Pomodoro) por dia (minutos). */
  focusMin: number;
  /** Meta de tarefas concluídas por dia. */
  tasks: number;
}

const DEFAULT_GOALS: UsageGoals = { appMin: 240, focusMin: 120, tasks: 5 };

/**
 * Telemetria local de uso: tempo de app aberto por dia, por hora-do-dia e por
 * projeto, além das metas diárias. Um driver no App soma o tempo real a cada
 * minuto enquanto o app está aberto.
 */
interface AppUsageStore {
  days: Record<string, number>;          // YYYY-MM-DD → ms
  byHour: Record<number, number>;        // hora (0-23) → ms acumulado
  projects: Record<string, number>;      // nome do projeto → ms acumulado
  goals: UsageGoals;
  loaded: boolean;
  load: () => Promise<void>;
  /** Soma tempo ao dia/hora/projeto atuais (vindo do driver). */
  tick: (ms: number, ctx: { hour: number; project?: string | null }) => void;
  setGoals: (patch: Partial<UsageGoals>) => void;
}

const PERSIST_KEY = 'appUsage';

interface PersistShape {
  days: Record<string, number>;
  byHour: Record<number, number>;
  projects: Record<string, number>;
  goals: UsageGoals;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(get: () => AppUsageStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { days, byHour, projects, goals } = get();
    const payload: PersistShape = { days, byHour, projects, goals };
    void window.api.store.set(PERSIST_KEY, payload);
  }, 2000);
}

export const useAppUsageStore = create<AppUsageStore>((set, get) => ({
  days: {},
  byHour: {},
  projects: {},
  goals: DEFAULT_GOALS,
  loaded: false,

  async load() {
    const stored = await window.api.store.get<PersistShape>(PERSIST_KEY);
    set({
      days: stored?.days ?? {},
      byHour: stored?.byHour ?? {},
      projects: stored?.projects ?? {},
      goals: { ...DEFAULT_GOALS, ...(stored?.goals ?? {}) },
      loaded: true,
    });
  },

  tick(ms, ctx) {
    if (ms <= 0) return;
    const key = toKey(new Date());
    const s = get();
    const days = { ...s.days, [key]: (s.days[key] ?? 0) + ms };
    const byHour = { ...s.byHour, [ctx.hour]: (s.byHour[ctx.hour] ?? 0) + ms };
    const projects = ctx.project
      ? { ...s.projects, [ctx.project]: (s.projects[ctx.project] ?? 0) + ms }
      : s.projects;
    set({ days, byHour, projects });
    schedulePersist(get);
  },

  setGoals(patch) {
    const goals = { ...get().goals, ...patch };
    set({ goals });
    schedulePersist(get);
  },
}));

/** Nome do projeto da aba ativa (pra atribuir o tempo). */
function activeProjectName(): string | null {
  try {
    const ws = useWorkspaceStore.getState();
    const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
    if (!tab) return null;
    const leaf = collectLeaves(tab.root).find((l) => l.projectName && l.projectPath);
    return leaf?.projectName ?? null;
  } catch {
    return null;
  }
}

/** Inicia o rastreio (chamar 1x no App). Retorna a função de parada. */
export function startAppUsageTracking(): () => void {
  let last = Date.now();
  const id = setInterval(() => {
    const now = Date.now();
    const delta = Math.min(now - last, 5 * 60_000); // teto: não conta suspensão
    last = now;
    useAppUsageStore.getState().tick(delta, { hour: new Date().getHours(), project: activeProjectName() });
  }, 60_000);
  return () => clearInterval(id);
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '0min';
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
