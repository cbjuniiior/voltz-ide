import { create } from 'zustand';
import { toast } from '@/stores/toasts';

export interface GitState {
  isRepo: boolean;
  branch: string | null;
  changes: number;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

interface GitStore {
  byPath: Record<string, GitState>;
  /** Atualiza o estado git local (branch + alterações + ahead/behind). */
  refresh: (path: string) => Promise<void>;
  /** Faz `git fetch` (atualiza o origin) + refresh; avisa se chegaram commits novos. */
  checkRemote: (path: string) => Promise<void>;
  /** `git pull` + refresh. */
  pull: (path: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function baseName(p: string) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

export const useGitStore = create<GitStore>((set, get) => ({
  byPath: {},
  async refresh(path) {
    try {
      const info = await window.api.git.info(path);
      set((s) => ({ byPath: { ...s.byPath, [path]: info } }));
    } catch {
      /* ignore */
    }
  },
  async checkRemote(path) {
    const prev = get().byPath[path]?.behind ?? 0;
    try { await window.api.git.fetch(path); } catch { /* offline / sem remoto */ }
    await get().refresh(path);
    const now = get().byPath[path]?.behind ?? 0;
    if (now > prev && now > 0) {
      toast.info('🔄 Atualização no GitHub', `${baseName(path)}: ${now} commit${now > 1 ? 's' : ''} novo${now > 1 ? 's' : ''} pra baixar. Dê um pull no chip do git.`);
    }
  },
  async pull(path) {
    const res = await window.api.git.pull(path);
    await get().refresh(path);
    return res;
  },
}));

export function selectGit(byPath: Record<string, GitState>, path: string | null | undefined): GitState | null {
  if (!path) return null;
  return byPath[path] ?? null;
}
