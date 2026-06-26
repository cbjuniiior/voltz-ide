import { create } from 'zustand';
import type { Project } from '@shared/types';

interface ProjectsStore {
  projects: Project[];
  scanning: boolean;
  filter: string;
  setFilter: (q: string) => void;
  scan: (roots: string[]) => Promise<void>;
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  scanning: false,
  filter: '',
  setFilter: (q) => set({ filter: q }),
  async scan(roots) {
    set({ scanning: true });
    try {
      const projects = roots.length === 0 ? [] : await window.api.projects.scan(roots);
      set({ projects });
    } finally {
      set({ scanning: false });
    }
  },
}));
