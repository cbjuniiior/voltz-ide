import { create } from 'zustand';
import type { Settings, ShellKind } from '@shared/types';
import { DEFAULT_TERMINAL_THEME_ID } from '@/lib/terminalThemes';

/** Shell padrão de acordo com o SO: zsh no macOS, bash no Linux, PowerShell no Windows. */
function platformDefaultShell(): ShellKind {
  const p = window.api.app.platform;
  if (p === 'win32') return 'pwsh';
  if (p === 'darwin') return 'zsh';
  return 'bash';
}

/** Os shells do Windows não existem no macOS/Linux — migra para o shell do SO. */
function coerceShellForPlatform(shell: ShellKind): ShellKind {
  const p = window.api.app.platform;
  if (p !== 'win32' && (shell === 'pwsh' || shell === 'cmd')) return platformDefaultShell();
  return shell;
}

const DEFAULT_SETTINGS: Settings = {
  rootFolders: [],
  claudePath: null,
  claudeCommand: 'claude',
  defaultShell: 'pwsh',
  fontSize: 13,
  theme: 'dark',
  terminalTheme: DEFAULT_TERMINAL_THEME_ID,
  terminalFontFamily: '',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  editorAutoSave: false,
  editorAutoSaveDelayMs: 800,
  whisperApiKey: null,
  whisperApiBase: 'https://api.groq.com/openai/v1',
  whisperModel: 'whisper-large-v3-turbo',
  notifyClaudeIdle: true,
  soundClaudeIdle: true,
  autoOpenBrowserOnDev: true,
  recentProjects: [],
};

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    let stored: Partial<Settings> | undefined;
    try {
      const raw = await window.api.store.get<unknown>('settings');
      // Só mescla se for um objeto de verdade — array/string/null corromperiam o spread.
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        stored = raw as Partial<Settings>;
      }
    } catch {
      stored = undefined;
    }
    const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    const fixedShell = coerceShellForPlatform(merged.defaultShell);
    if (fixedShell !== merged.defaultShell) {
      merged.defaultShell = fixedShell;
      // Persiste a migração para o selo do terminal e as Configurações baterem.
      void window.api.store.set('settings', merged);
    }
    set({ settings: merged, loaded: true });
  },
  async update(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await window.api.store.set('settings', next);
  },
}));
