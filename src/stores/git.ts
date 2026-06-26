import { create } from 'zustand';

export interface GitState {
  isRepo: boolean;
  branch: string | null;
  changes: number;
}

interface GitStore {
  byPath: Record<string, GitState>;
  /** Atualiza o estado git de um projeto (branch + nº de alterações). */
  refresh: (path: string) => Promise<void>;
}

export const useGitStore = create<GitStore>((set) => ({
  byPath: {},
  async refresh(path) {
    try {
      const info = await window.api.git.info(path);
      set((s) => ({ byPath: { ...s.byPath, [path]: info } }));
    } catch {
      /* ignore */
    }
  },
}));

export function selectGit(byPath: Record<string, GitState>, path: string | null | undefined): GitState | null {
  if (!path) return null;
  return byPath[path] ?? null;
}
