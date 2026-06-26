import { create } from 'zustand';

export interface AiProvider {
  id: string;
  label: string;
  /** Comando do CLI a rodar no terminal (ex.: 'claude', 'codex', 'gemini'). */
  command: string;
  color: string;
  enabled: boolean;
}

const DEFAULTS: AiProvider[] = [
  { id: 'claude', label: 'Claude', command: 'claude', color: '#d97757', enabled: true },
  { id: 'codex', label: 'Codex', command: 'codex', color: '#10a37f', enabled: true },
  { id: 'gemini', label: 'Gemini', command: 'gemini', color: '#4587f4', enabled: true },
];

interface ProvidersStore {
  providers: AiProvider[];
  loaded: boolean;
  load: () => Promise<void>;
  add: () => Promise<void>;
  update: (id: string, patch: Partial<AiProvider>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => Promise<void>;
}

export const useProvidersStore = create<ProvidersStore>((set, get) => ({
  providers: DEFAULTS,
  loaded: false,
  async load() {
    const stored = await window.api.store.get<AiProvider[]>('aiProviders');
    set({ providers: stored && stored.length ? stored : DEFAULTS, loaded: true });
  },
  async add() {
    const id = 'prov_' + Math.random().toString(36).slice(2, 8);
    const next = [...get().providers, { id, label: 'Novo', command: 'echo hello', color: '#7c6bff', enabled: true }];
    set({ providers: next });
    await window.api.store.set('aiProviders', next);
  },
  async update(id, patch) {
    const next = get().providers.map((x) => (x.id === id ? { ...x, ...patch } : x));
    set({ providers: next });
    await window.api.store.set('aiProviders', next);
  },
  async remove(id) {
    const next = get().providers.filter((x) => x.id !== id);
    set({ providers: next });
    await window.api.store.set('aiProviders', next);
  },
  async reset() {
    set({ providers: DEFAULTS });
    await window.api.store.set('aiProviders', DEFAULTS);
  },
}));
