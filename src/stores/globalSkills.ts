import { create } from 'zustand';
import type { GlobalSkillEntry } from '@/lib/globalSkillsCatalog';

const PERSIST_KEY = 'globalSkillsInstalled';

interface InstalledRecord {
  /** ids de skill materializados no disco (pode ser >1 para pacotes como superpowers). */
  ids: string[];
  accounts: number;
  at: number;
}

interface PersistShape {
  installed: Record<string, InstalledRecord>;
}

interface GlobalSkillsState {
  installed: Record<string, InstalledRecord>;
  loaded: boolean;
  busy: Record<string, boolean>;
  load: () => Promise<void>;
  isInstalled: (catalogId: string) => boolean;
  install: (entry: GlobalSkillEntry, dirs: string[]) => Promise<{ ok: boolean; error?: string; count?: number; accounts?: number }>;
  uninstall: (entry: GlobalSkillEntry, dirs: string[]) => Promise<{ ok: boolean; error?: string }>;
}

function persist(installed: Record<string, InstalledRecord>) {
  void window.api.store.set(PERSIST_KEY, { installed } satisfies PersistShape);
}

export const useGlobalSkillsStore = create<GlobalSkillsState>((set, get) => ({
  installed: {},
  loaded: false,
  busy: {},

  async load() {
    const stored = await window.api.store.get<PersistShape>(PERSIST_KEY);
    set({ installed: stored?.installed ?? {}, loaded: true });
  },

  isInstalled(catalogId) {
    return !!get().installed[catalogId];
  },

  async install(entry, dirs) {
    if (entry.kind !== 'copy' || !entry.spec) return { ok: false, error: 'Skill não é instalável por cópia.' };
    const targets = dirs.filter(Boolean);
    if (!targets.length) return { ok: false, error: 'Nenhuma conta encontrada.' };
    set((s) => ({ busy: { ...s.busy, [entry.id]: true } }));
    try {
      const res = await window.api.skills.installGlobalFromRepo(entry.spec, targets);
      if (res.ok) {
        const installed = { ...get().installed, [entry.id]: { ids: res.installedIds, accounts: res.accounts, at: Date.now() } };
        set({ installed });
        persist(installed);
        return { ok: true, count: res.installedIds.length, accounts: res.accounts };
      }
      return { ok: false, error: res.error };
    } finally {
      set((s) => ({ busy: { ...s.busy, [entry.id]: false } }));
    }
  },

  async uninstall(entry, dirs) {
    const targets = dirs.filter(Boolean);
    const rec = get().installed[entry.id];
    const ids = rec?.ids?.length ? rec.ids : [entry.id];
    set((s) => ({ busy: { ...s.busy, [entry.id]: true } }));
    try {
      const res = await window.api.skills.uninstallGlobal(ids, targets);
      if (res.ok) {
        const installed = { ...get().installed };
        delete installed[entry.id];
        set({ installed });
        persist(installed);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    } finally {
      set((s) => ({ busy: { ...s.busy, [entry.id]: false } }));
    }
  },
}));
