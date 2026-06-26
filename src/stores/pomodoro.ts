import { create } from 'zustand';
import { useTasksStore } from './tasks';

export type PomodoroPhase = 'focus' | 'break';

const FOCUS_MS = 25 * 60 * 1000;
const BREAK_MS = 5 * 60 * 1000;

export function durationFor(phase: PomodoroPhase): number {
  return phase === 'focus' ? FOCUS_MS : BREAK_MS;
}

interface PomodoroStore {
  phase: PomodoroPhase;
  running: boolean;
  /** Timestamp (ms) em que a fase atual termina — válido enquanto running. */
  endsAt: number | null;
  /** Tempo restante (ms) quando pausado/parado. */
  remaining: number;
  /** Pomodoros de foco concluídos nesta sessão. */
  cycles: number;
  /** Tarefa vinculada (o tempo de foco é creditado nela). */
  taskId: string | null;
  /** Início da rodada de foco atual (interno, para creditar tempo). */
  runStartedAt: number | null;

  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  /** Inicia um foco vinculado a uma tarefa (ou retoma, se for a mesma). */
  startFor: (taskId: string) => void;
  /** Desvincula a tarefa (sem zerar o timer). */
  clearTask: () => void;
  /** Chamado pelo driver quando o tempo zera: troca de fase e conta o ciclo. */
  complete: () => void;
}

export const usePomodoroStore = create<PomodoroStore>((set, get) => {
  /** Credita o tempo da rodada de foco em andamento à tarefa vinculada. */
  function creditFocus() {
    const s = get();
    if (s.phase === 'focus' && s.taskId && s.runStartedAt) {
      const elapsed = Math.min(Math.max(0, Date.now() - s.runStartedAt), FOCUS_MS);
      if (elapsed > 1000) useTasksStore.getState().addTime(s.taskId, elapsed);
    }
    set({ runStartedAt: null });
  }

  return {
    phase: 'focus',
    running: false,
    endsAt: null,
    remaining: FOCUS_MS,
    cycles: 0,
    taskId: null,
    runStartedAt: null,

    start() {
      const s = get();
      if (s.running) return;
      const rem = s.remaining > 0 ? s.remaining : durationFor(s.phase);
      set({
        running: true,
        endsAt: Date.now() + rem,
        runStartedAt: s.phase === 'focus' ? Date.now() : null,
      });
    },

    pause() {
      const s = get();
      if (!s.running) return;
      creditFocus();
      const rem = Math.max(0, (s.endsAt ?? 0) - Date.now());
      set({ running: false, endsAt: null, remaining: rem });
    },

    reset() {
      creditFocus();
      set((s) => ({ running: false, endsAt: null, remaining: durationFor(s.phase) }));
    },

    skip() {
      creditFocus();
      set((s) => {
        const next: PomodoroPhase = s.phase === 'focus' ? 'break' : 'focus';
        return { phase: next, running: false, endsAt: null, remaining: durationFor(next) };
      });
    },

    startFor(taskId) {
      if (get().taskId === taskId) {
        // Mesma tarefa: apenas inicia/retoma sem zerar.
        get().start();
        return;
      }
      // Tarefa diferente: credita a atual e começa um foco do zero para a nova.
      creditFocus();
      set({ taskId, phase: 'focus', running: false, endsAt: null, remaining: FOCUS_MS });
      get().start();
    },

    clearTask() {
      creditFocus();
      set({ taskId: null });
    },

    complete() {
      creditFocus();
      set((s) => {
        const next: PomodoroPhase = s.phase === 'focus' ? 'break' : 'focus';
        return {
          phase: next,
          running: false,
          endsAt: null,
          remaining: durationFor(next),
          cycles: s.phase === 'focus' ? s.cycles + 1 : s.cycles,
        };
      });
    },
  };
});

/** Tempo restante (ms) considerando o instante `now`. */
export function pomodoroRemaining(
  s: Pick<PomodoroStore, 'running' | 'endsAt' | 'remaining'>,
  now: number,
): number {
  return s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remaining;
}
