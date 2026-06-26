import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs: number;
  action?: { label: string; onClick: () => void };
}

interface ToastsStore {
  items: Toast[];
  push: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void;
}

let counter = 0;
const nextId = () => `toast-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const useToastsStore = create<ToastsStore>((set) => ({
  items: [],
  push(toast) {
    const id = nextId();
    const durationMs = toast.durationMs ?? (toast.kind === 'error' ? 8000 : 4500);
    const full: Toast = { id, durationMs, ...toast };
    set((s) => ({ items: [...s.items, full] }));
    if (durationMs > 0) {
      setTimeout(() => {
        set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
      }, durationMs);
    }
    return id;
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
  update(id, patch) {
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },
}));

export const toast = {
  info: (title: string, description?: string) =>
    useToastsStore.getState().push({ kind: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToastsStore.getState().push({ kind: 'success', title, description }),
  warning: (title: string, description?: string) =>
    useToastsStore.getState().push({ kind: 'warning', title, description }),
  error: (title: string, description?: string) =>
    useToastsStore.getState().push({ kind: 'error', title, description }),
};
