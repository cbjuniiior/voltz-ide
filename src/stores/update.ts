import { create } from 'zustand';
import type { UpdateStatus } from '@shared/types';

interface UpdateStore {
  status: UpdateStatus;
  appVersion: string;
  /** Usuário fechou o banner do update pronto atual. */
  dismissed: boolean;
  bound: boolean;
  init: () => void;
  check: () => void;
  install: () => void;
  dismiss: () => void;
  /** Pré-visualização do banner em dev. */
  simulate: () => void;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  status: { state: 'idle' },
  appVersion: '',
  dismissed: false,
  bound: false,

  init() {
    if (get().bound) return;
    set({ bound: true });
    window.api.updates.onStatus((status) => {
      set((s) => {
        // Um novo "pronto" (versão diferente ou vindo de outro estado) reabre o banner.
        const reopen = status.state === 'ready'
          && (s.status.state !== 'ready' || s.status.version !== status.version);
        return { status, dismissed: reopen ? false : s.dismissed };
      });
    });
    window.api.updates.current()
      .then(({ version }) => set({ appVersion: version }))
      .catch(() => { /* handler ainda não pronto — ignora */ });
  },

  check() { void window.api.updates.check(); },
  install() { void window.api.updates.quitAndInstall(); },
  dismiss() { set({ dismissed: true }); },
  simulate() { void window.api.updates.simulate('0.2.3'); },
}));
