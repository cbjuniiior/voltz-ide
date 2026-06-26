import { create } from 'zustand';
import type { DevServerState } from '@shared/types';
import { toast, useToastsStore } from './toasts';
import { useSettingsStore } from './settings';
import { useWorkspaceStore } from './workspace';

interface DevServersStore {
  byPath: Record<string, DevServerState>;
  bind: () => () => void;
  start: (projectPath: string, opts?: { script?: string }) => Promise<void>;
  stop: (projectPath: string) => Promise<void>;
  restart: (projectPath: string, opts?: { script?: string }) => Promise<void>;
  openInBrowser: (url: string) => Promise<void>;
}

function projectLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Abre o site do dev no app, se a preferência estiver ligada. */
function maybeOpenDevBrowser(projectPath: string, url: string) {
  if (!useSettingsStore.getState().settings.autoOpenBrowserOnDev) return;
  useWorkspaceStore.getState().openDevBrowser(projectLabel(projectPath), projectPath, url);
}

export const useDevServersStore = create<DevServersStore>((set, get) => ({
  byPath: {},

  bind() {
    void window.api.devServer.listAll().then((states) => {
      const byPath: Record<string, DevServerState> = {};
      for (const s of states) byPath[s.projectPath] = s;
      set({ byPath });
    });

    return window.api.devServer.onUpdate((state) => {
      const prev = get().byPath[state.projectPath];
      set((s) => ({ byPath: { ...s.byPath, [state.projectPath]: state } }));

      // Toast on phase transitions
      const label = projectLabel(state.projectPath);
      const prevPhase = prev?.phase;
      if (prevPhase !== state.phase) {
        if (state.phase === 'running' && state.url) {
          useToastsStore.getState().push({
            kind: 'success',
            title: `Dev server pronto · ${label}`,
            description: state.url,
            action: {
              label: 'Abrir no navegador',
              onClick: () => { void window.api.devServer.openUrl(state.url!); },
            },
          });
          maybeOpenDevBrowser(state.projectPath, state.url);
        } else if (state.phase === 'error') {
          toast.error(
            `Falha no dev server · ${label}`,
            state.errorMessage || 'Veja os logs para detalhes',
          );
        } else if (state.phase === 'installing' && prevPhase !== 'installing') {
          toast.info(`Instalando dependências · ${label}`, `${state.pm} install`);
        }
      } else if (prevPhase === 'running' && state.phase === 'running' && !prev?.url && state.url) {
        // URL appeared after running already started
        useToastsStore.getState().push({
          kind: 'success',
          title: `URL detectada · ${label}`,
          description: state.url,
          action: {
            label: 'Abrir no navegador',
            onClick: () => { void window.api.devServer.openUrl(state.url!); },
          },
        });
        maybeOpenDevBrowser(state.projectPath, state.url);
      }
    });
  },

  async start(projectPath, opts) {
    const current = get().byPath[projectPath];
    if (current && (current.phase === 'installing' || current.phase === 'starting' || current.phase === 'running')) {
      return;
    }
    await window.api.devServer.start(projectPath, opts);
  },

  async stop(projectPath) {
    await window.api.devServer.stop(projectPath);
  },

  async restart(projectPath, opts) {
    const cur = get().byPath[projectPath];
    const active = cur && (cur.phase === 'running' || cur.phase === 'starting' || cur.phase === 'installing');
    if (active) {
      await window.api.devServer.stop(projectPath);
      // Aguarda o servidor realmente parar antes de subir de novo (com timeout).
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          const ph = get().byPath[projectPath]?.phase;
          if (ph === 'stopped' || ph === 'idle' || ph === 'error' || ph == null) { done(); }
        }, 200);
        const to = setTimeout(done, 6000);
        function done() { clearInterval(poll); clearTimeout(to); resolve(); }
      });
    }
    await window.api.devServer.start(projectPath, opts);
  },

  async openInBrowser(url) {
    await window.api.devServer.openUrl(url);
  },
}));

export function selectDevServer(byPath: Record<string, DevServerState>, projectPath: string): DevServerState | null {
  return byPath[projectPath] ?? null;
}
