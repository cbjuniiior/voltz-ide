import { create } from 'zustand';
import { PERSONAS } from '@/lib/personaCatalog';

/** Estado do Esquadrão: quais personas estão instaladas (conta principal) + versão. */
interface SquadStore {
  installed: string[];
  loaded: boolean;
  busy: boolean;
  version: string;
  load: () => Promise<void>;
  install: () => Promise<{ ok: boolean; error?: string }>;
  uninstall: () => Promise<void>;
}

export const useSquadStore = create<SquadStore>((set, get) => ({
  installed: [],
  loaded: false,
  busy: false,
  version: '',
  async load() {
    try {
      const [installed, version] = await Promise.all([
        window.api.agents.listInstalled(),
        window.api.agents.version(),
      ]);
      set({ installed, version, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  async install() {
    set({ busy: true });
    try {
      const res = await window.api.agents.install();
      if (res.ok) { await get().load(); return { ok: true }; }
      return { ok: false, error: res.error };
    } finally {
      set({ busy: false });
    }
  },
  async uninstall() {
    set({ busy: true });
    try {
      await window.api.agents.uninstall();
      await get().load();
    } finally {
      set({ busy: false });
    }
  },
}));

/** Todas as personas do catálogo estão instaladas? */
export function allInstalled(installed: string[]): boolean {
  return PERSONAS.every((p) => installed.includes(p.id));
}
