import { create } from 'zustand';

/**
 * Sinaliza, por aba, que algo pede atenção (ex.: o Claude terminou enquanto
 * você estava em outra aba). Volátil — não é persistido.
 */
interface AttentionStore {
  tabs: Record<string, boolean>;
  mark: (tabId: string) => void;
  clear: (tabId: string) => void;
}

export const useAttentionStore = create<AttentionStore>((set) => ({
  tabs: {},
  mark: (tabId) => set((s) => (s.tabs[tabId] ? s : { tabs: { ...s.tabs, [tabId]: true } })),
  clear: (tabId) => set((s) => (s.tabs[tabId] ? { tabs: { ...s.tabs, [tabId]: false } } : s)),
}));
