import { create } from 'zustand';
import type { RemoteStatusInfo, RemoteActivity } from '@shared/types';
import { toast } from '@/stores/toasts';

interface RemoteStore {
  status: RemoteStatusInfo;
  projectsEnabled: string[];
  activity: RemoteActivity[];
  history: RemoteActivity[];   // persistido, mais recente primeiro
  refresh: () => Promise<void>;
  loadHistory: () => Promise<void>;
  clearHistory: (project?: string) => Promise<void>;
  setProjectEnabled: (path: string, on: boolean) => Promise<void>;
  init: () => () => void;
}

const EMPTY: RemoteStatusInfo = { running: false, botUsername: null, paired: false, pairingCode: null };

// A assinatura é feita uma vez por toda a vida do app (toasts globais + feed).
let subscribed = false;

export const useRemoteStore = create<RemoteStore>((set, get) => ({
  status: EMPTY,
  projectsEnabled: [],
  activity: [],
  history: [],
  async refresh() {
    const [status, projectsEnabled] = await Promise.all([
      window.api.remote.status(),
      window.api.remote.listProjectsEnabled(),
    ]);
    set({ status, projectsEnabled });
  },
  async loadHistory() {
    const h = await window.api.remote.getHistory();
    set({ history: h.slice().reverse() }); // disco guarda cronológico; UI usa recente-primeiro
  },
  async clearHistory(project) {
    await window.api.remote.clearHistory(project);
    set((s) => ({ history: project ? s.history.filter((e) => e.project !== project) : [] }));
  },
  async setProjectEnabled(path, on) {
    await window.api.remote.setProjectEnabled(path, on);
    set((s) => ({ projectsEnabled: on ? [...new Set([...s.projectsEnabled, path])] : s.projectsEnabled.filter((p) => p !== path) }));
  },
  init() {
    void get().refresh();
    void get().loadHistory();
    if (subscribed) return () => {};
    subscribed = true;
    window.api.remote.onStatus((status) => set({ status }));
    window.api.remote.onActivity((e) => {
      set((s) => ({ activity: [e, ...s.activity].slice(0, 50), history: [e, ...s.history].slice(0, 800) }));
      const proj = e.project ? `${e.project} · ` : '';
      if (e.kind === 'prompt') toast.info('📱 Pedido remoto', `${proj}${e.text.slice(0, 90)}`);
      else if (e.kind === 'approval') toast.info('🔐 Aprovação pedida no Telegram', e.project);
      else if (e.kind === 'info') toast.info('📡 Remoto', `${proj}${e.text}`);
    });
    return () => {};
  },
}));
