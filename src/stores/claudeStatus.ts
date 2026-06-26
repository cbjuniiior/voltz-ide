import { create } from 'zustand';

// 'running' = produzindo · 'approval' = parou pedindo sua confirmação (y/n, escolha)
// · 'waiting' = terminou e aguarda você.
export type ClaudeStatus = 'running' | 'waiting' | 'approval';

/**
 * Status do Claude por painel (terminal): 'running' enquanto produz output,
 * 'waiting' quando termina/aguarda você. Volátil. Alimenta o HUD de visão geral.
 */
interface ClaudeStatusStore {
  byPane: Record<string, ClaudeStatus>;
  /** Skill em uso por painel (best-effort, detectada do output). */
  skillByPane: Record<string, string>;
  setStatus: (paneId: string, status: ClaudeStatus) => void;
  setSkill: (paneId: string, skill: string) => void;
  clearSkill: (paneId: string) => void;
  clear: (paneId: string) => void;
}

export const useClaudeStatusStore = create<ClaudeStatusStore>((set) => ({
  byPane: {},
  skillByPane: {},
  setStatus: (paneId, status) =>
    set((s) => (s.byPane[paneId] === status ? s : { byPane: { ...s.byPane, [paneId]: status } })),
  setSkill: (paneId, skill) =>
    set((s) => (s.skillByPane[paneId] === skill ? s : { skillByPane: { ...s.skillByPane, [paneId]: skill } })),
  clearSkill: (paneId) =>
    set((s) => {
      if (!(paneId in s.skillByPane)) return s;
      const next = { ...s.skillByPane };
      delete next[paneId];
      return { skillByPane: next };
    }),
  clear: (paneId) =>
    set((s) => {
      const next = { ...s.byPane };
      delete next[paneId];
      const nextSkill = { ...s.skillByPane };
      delete nextSkill[paneId];
      return { byPane: next, skillByPane: nextSkill };
    }),
}));
