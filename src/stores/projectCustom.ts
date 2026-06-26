import { create } from 'zustand';
import type { ProjectCustomization } from '@shared/types';

type CustomMap = Record<string, ProjectCustomization>;

export const DEFAULT_CUSTOM: ProjectCustomization = { favorite: false };

interface ProjectCustomStore {
  customs: CustomMap;
  loaded: boolean;
  load: () => Promise<void>;
  update: (projectPath: string, patch: Partial<ProjectCustomization>) => Promise<void>;
  toggleFavorite: (projectPath: string) => Promise<void>;
}

export const useProjectCustomStore = create<ProjectCustomStore>((set, get) => ({
  customs: {},
  loaded: false,

  async load() {
    const stored = await window.api.store.get<CustomMap>('projectCustoms');
    set({ customs: stored ?? {}, loaded: true });
  },

  async update(projectPath, patch) {
    const current = get().customs[projectPath] ?? DEFAULT_CUSTOM;
    const next: CustomMap = {
      ...get().customs,
      [projectPath]: { ...current, ...patch },
    };
    set({ customs: next });
    await window.api.store.set('projectCustoms', next);
  },

  async toggleFavorite(projectPath) {
    const current = get().customs[projectPath] ?? DEFAULT_CUSTOM;
    await get().update(projectPath, { favorite: !current.favorite });
  },
}));

/** Selector helper — estável, sem criar novo objeto a cada render */
export function selectCustom(customs: CustomMap, path: string): ProjectCustomization {
  return customs[path] ?? DEFAULT_CUSTOM;
}
