import { create } from 'zustand';
import type { ProcSample } from '@shared/types';

interface ProcMonitorStore {
  /** Última amostra de uso por terminalId. */
  byTerminal: Record<string, ProcSample>;
  /** Liga o recebimento de amostras do main. Retorna unsubscribe. */
  bind: () => () => void;
}

export const useProcMonitorStore = create<ProcMonitorStore>((set) => ({
  byTerminal: {},
  bind() {
    return window.api.procMonitor.onSample((s) => {
      set((st) => ({ byTerminal: { ...st.byTerminal, [s.terminalId]: s } }));
    });
  },
}));
