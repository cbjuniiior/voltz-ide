import { create } from 'zustand';
import type { PaneNode, Tab } from '@shared/types';
import { mapNode, newId } from '@/lib/layoutTree';
import { useWorkspaceStore } from './workspace';

export interface WorkspaceProfile {
  id: string;
  name: string;
  tabs: Tab[];
  activeTabId: string | null;
  savedAt: number;
}

const PERSIST_KEY = 'workspaceProfiles';

/** Zera os terminalIds de uma árvore (os PTYs não sobrevivem ao snapshot). */
function clearTerminals(root: PaneNode): PaneNode {
  return mapNode(root, (n) => (n.kind === 'pane' ? { ...n, terminalId: null } : n));
}

function snapshotCurrentTabs(): { tabs: Tab[]; activeTabId: string | null } {
  const ws = useWorkspaceStore.getState();
  const tabs = ws.tabs.map((t) => ({ ...t, root: clearTerminals(t.root) }));
  return { tabs, activeTabId: ws.activeTabId };
}

interface ProfilesStore {
  profiles: WorkspaceProfile[];
  loaded: boolean;
  load: () => Promise<void>;
  saveCurrent: (name: string) => void;
  update: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  apply: (id: string) => void;
}

export const useWorkspaceProfilesStore = create<ProfilesStore>((set, get) => ({
  profiles: [],
  loaded: false,

  async load() {
    const stored = await window.api.store.get<WorkspaceProfile[]>(PERSIST_KEY);
    set({ profiles: Array.isArray(stored) ? stored : [], loaded: true });
  },

  saveCurrent(name) {
    const n = name.trim();
    if (!n) return;
    const snap = snapshotCurrentTabs();
    const profile: WorkspaceProfile = {
      id: newId('wsp'),
      name: n,
      tabs: snap.tabs,
      activeTabId: snap.activeTabId,
      savedAt: Date.now(),
    };
    const next = [...get().profiles, profile];
    set({ profiles: next });
    void window.api.store.set(PERSIST_KEY, next);
  },

  update(id) {
    const snap = snapshotCurrentTabs();
    const next = get().profiles.map((p) =>
      p.id === id ? { ...p, tabs: snap.tabs, activeTabId: snap.activeTabId, savedAt: Date.now() } : p
    );
    set({ profiles: next });
    void window.api.store.set(PERSIST_KEY, next);
  },

  rename(id, name) {
    const n = name.trim();
    if (!n) return;
    const next = get().profiles.map((p) => (p.id === id ? { ...p, name: n } : p));
    set({ profiles: next });
    void window.api.store.set(PERSIST_KEY, next);
  },

  remove(id) {
    const next = get().profiles.filter((p) => p.id !== id);
    set({ profiles: next });
    void window.api.store.set(PERSIST_KEY, next);
  },

  apply(id) {
    const p = get().profiles.find((x) => x.id === id);
    if (!p) return;
    useWorkspaceStore.getState().replaceTabs(p.tabs, p.activeTabId);
  },
}));
