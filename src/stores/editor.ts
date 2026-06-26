import { create } from 'zustand';

// Per-workspace-tab editor state: which files are open, which one is active,
// and the in-memory contents (with dirty tracking).
//
// Key shape: editor state is namespaced by the workspace tab ID, so two tabs
// pointing at different projects don't share file buffers.
//
// Persistence: only the LIST of open files per tab is persisted (paths +
// active selection). Contents are re-read from disk on load — that keeps the
// store small and avoids stale buffers.

interface PersistedEditorState {
  byTab: Record<string, { openFilePaths: string[]; activePath: string | null; projectRoot: string }>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(snapshotter: () => PersistedEditorState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void window.api.store.set('editorState', snapshotter());
  }, 500);
}

export interface OpenFile {
  /** Absolute path on disk (key inside a workspace tab). */
  path: string;
  /** Display name — last segment of the path. */
  name: string;
  /** Project root this file lives under (so saves know what root to validate against). */
  projectRoot: string;
  /** Last content read from disk. Used to compare against current and decide dirty. */
  savedContent: string;
  /** Current buffer content shown in Monaco. */
  content: string;
  /** mtime at last successful read or write — passed back to the IPC for stale-write detection. */
  mtimeMs: number;
  /** Loading state for the initial read. */
  loading: boolean;
  /** Read error (if file couldn't be opened). */
  error: string | null;
}

export interface EditorTabState {
  openFiles: OpenFile[];
  activePath: string | null;
}

interface EditorStore {
  /** workspaceTabId → editor state for that tab */
  byTab: Record<string, EditorTabState>;
  loaded: boolean;
  /** Per-file flag set when the watcher reports a change on disk while the
   * buffer was clean — used by the editor area to show a "reload?" hint. */
  externallyChanged: Record<string, boolean>;

  // Queries
  getTab: (workspaceTabId: string) => EditorTabState;
  isDirty: (workspaceTabId: string, path: string) => boolean;
  hasAnyDirty: (workspaceTabId: string) => boolean;

  // Mutations
  load: () => Promise<void>;
  openFile: (workspaceTabId: string, projectRoot: string, absPath: string) => Promise<void>;
  setActive: (workspaceTabId: string, path: string) => void;
  setContent: (workspaceTabId: string, path: string, content: string) => void;
  closeFile: (workspaceTabId: string, path: string) => void;
  closeAllForTab: (workspaceTabId: string) => void;
  saveFile: (workspaceTabId: string, path: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  reloadFile: (workspaceTabId: string, path: string) => Promise<void>;
  /** Called after the file is deleted or renamed outside the editor */
  forgetFile: (workspaceTabId: string, path: string) => void;
  /** Watcher said this file changed in disk. */
  noteExternalChange: (path: string) => void;
  clearExternalChange: (path: string) => void;

  /** Pedido para revelar uma linha no editor (ex.: vindo da Busca). */
  pendingReveal: { path: string; line: number } | null;
  requestReveal: (path: string, line: number) => void;
  consumeReveal: () => void;
}

const EMPTY_TAB: EditorTabState = { openFiles: [], activePath: null };

function snapshot(get: () => EditorStore): PersistedEditorState {
  const out: PersistedEditorState = { byTab: {} };
  const { byTab } = get();
  for (const [tabId, tab] of Object.entries(byTab)) {
    if (tab.openFiles.length === 0) continue;
    out.byTab[tabId] = {
      openFilePaths: tab.openFiles.map((f) => f.path),
      activePath: tab.activePath,
      projectRoot: tab.openFiles[0].projectRoot,
    };
  }
  return out;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  byTab: {},
  loaded: false,
  externallyChanged: {},
  pendingReveal: null,

  requestReveal(path, line) {
    set({ pendingReveal: { path, line } });
  },
  consumeReveal() {
    if (get().pendingReveal) set({ pendingReveal: null });
  },

  getTab(workspaceTabId) {
    return get().byTab[workspaceTabId] ?? EMPTY_TAB;
  },

  async load() {
    const persisted = await window.api.store.get<PersistedEditorState>('editorState');
    set({ loaded: true });
    if (!persisted?.byTab) return;
    // Re-open every persisted file. openFile already de-duplicates and reads
    // from disk; we serialise so the active path is set last.
    for (const [tabId, tabState] of Object.entries(persisted.byTab)) {
      for (const filePath of tabState.openFilePaths) {
        await get().openFile(tabId, tabState.projectRoot, filePath);
      }
      if (tabState.activePath) {
        get().setActive(tabId, tabState.activePath);
      }
    }
  },

  isDirty(workspaceTabId, path) {
    const tab = get().byTab[workspaceTabId];
    if (!tab) return false;
    const file = tab.openFiles.find((f) => f.path === path);
    if (!file) return false;
    return file.content !== file.savedContent;
  },

  hasAnyDirty(workspaceTabId) {
    const tab = get().byTab[workspaceTabId];
    if (!tab) return false;
    return tab.openFiles.some((f) => f.content !== f.savedContent);
  },

  async openFile(workspaceTabId, projectRoot, absPath) {
    const existing = get().byTab[workspaceTabId]?.openFiles.find((f) => f.path === absPath);
    if (existing) {
      // Already open — just activate.
      set((s) => ({
        byTab: {
          ...s.byTab,
          [workspaceTabId]: {
            ...(s.byTab[workspaceTabId] ?? EMPTY_TAB),
            activePath: absPath,
          },
        },
      }));
      schedulePersist(() => snapshot(get));
      return;
    }

    // Insert a placeholder, then load.
    const name = absPath.split(/[\\/]/).pop() ?? absPath;
    const placeholder: OpenFile = {
      path: absPath,
      name,
      projectRoot,
      savedContent: '',
      content: '',
      mtimeMs: 0,
      loading: true,
      error: null,
    };
    set((s) => {
      const tab = s.byTab[workspaceTabId] ?? EMPTY_TAB;
      return {
        byTab: {
          ...s.byTab,
          [workspaceTabId]: {
            openFiles: [...tab.openFiles, placeholder],
            activePath: absPath,
          },
        },
      };
    });

    const result = await window.api.files.read(projectRoot, absPath);
    set((s) => {
      const tab = s.byTab[workspaceTabId];
      if (!tab) return s;
      const next = tab.openFiles.map((f) => {
        if (f.path !== absPath) return f;
        if (result.ok) {
          return {
            ...f,
            content: result.content,
            savedContent: result.content,
            mtimeMs: result.mtimeMs,
            loading: false,
            error: null,
          };
        }
        return { ...f, loading: false, error: result.error };
      });
      return {
        byTab: { ...s.byTab, [workspaceTabId]: { ...tab, openFiles: next } },
      };
    });
    schedulePersist(() => snapshot(get));
  },

  setActive(workspaceTabId, path) {
    set((s) => {
      const tab = s.byTab[workspaceTabId];
      if (!tab) return s;
      if (!tab.openFiles.some((f) => f.path === path)) return s;
      return { byTab: { ...s.byTab, [workspaceTabId]: { ...tab, activePath: path } } };
    });
    schedulePersist(() => snapshot(get));
  },

  setContent(workspaceTabId, path, content) {
    set((s) => {
      const tab = s.byTab[workspaceTabId];
      if (!tab) return s;
      const next = tab.openFiles.map((f) => f.path === path ? { ...f, content } : f);
      return { byTab: { ...s.byTab, [workspaceTabId]: { ...tab, openFiles: next } } };
    });
  },

  closeFile(workspaceTabId, path) {
    set((s) => {
      const tab = s.byTab[workspaceTabId];
      if (!tab) return s;
      const idx = tab.openFiles.findIndex((f) => f.path === path);
      if (idx === -1) return s;
      const next = tab.openFiles.filter((f) => f.path !== path);
      let nextActive = tab.activePath;
      if (tab.activePath === path) {
        // Pick neighbour: prefer next, fall back to previous, else null.
        nextActive = next[idx]?.path ?? next[idx - 1]?.path ?? null;
      }
      return {
        byTab: { ...s.byTab, [workspaceTabId]: { openFiles: next, activePath: nextActive } },
      };
    });
    schedulePersist(() => snapshot(get));
  },

  closeAllForTab(workspaceTabId) {
    set((s) => {
      const rest = { ...s.byTab };
      delete rest[workspaceTabId];
      return { byTab: rest };
    });
    schedulePersist(() => snapshot(get));
  },

  noteExternalChange(path) {
    set((s) => ({ externallyChanged: { ...s.externallyChanged, [path]: true } }));
  },

  clearExternalChange(path) {
    set((s) => {
      if (!s.externallyChanged[path]) return s;
      const rest = { ...s.externallyChanged };
      delete rest[path];
      return { externallyChanged: rest };
    });
  },

  async saveFile(workspaceTabId, path) {
    const tab = get().byTab[workspaceTabId];
    const file = tab?.openFiles.find((f) => f.path === path);
    if (!file) return { ok: false, error: 'Arquivo não está aberto.' };
    const result = await window.api.files.write(file.projectRoot, file.path, file.content, {
      expectedMtimeMs: file.mtimeMs,
    });
    if (!result.ok) return { ok: false, error: result.error };
    // Mark saved (savedContent == content) and update mtime.
    set((s) => {
      const t = s.byTab[workspaceTabId];
      if (!t) return s;
      const next = t.openFiles.map((f) => f.path === path
        ? { ...f, savedContent: f.content, mtimeMs: result.mtimeMs }
        : f);
      return { byTab: { ...s.byTab, [workspaceTabId]: { ...t, openFiles: next } } };
    });
    return { ok: true };
  },

  async reloadFile(workspaceTabId, path) {
    const tab = get().byTab[workspaceTabId];
    const file = tab?.openFiles.find((f) => f.path === path);
    if (!file) return;
    const result = await window.api.files.read(file.projectRoot, file.path);
    set((s) => {
      const t = s.byTab[workspaceTabId];
      if (!t) return s;
      const next = t.openFiles.map((f) => {
        if (f.path !== path) return f;
        if (result.ok) {
          return {
            ...f,
            content: result.content,
            savedContent: result.content,
            mtimeMs: result.mtimeMs,
            loading: false,
            error: null,
          };
        }
        return { ...f, loading: false, error: result.error };
      });
      return { byTab: { ...s.byTab, [workspaceTabId]: { ...t, openFiles: next } } };
    });
  },

  forgetFile(workspaceTabId, path) {
    get().closeFile(workspaceTabId, path);
  },
}));

/** Default empty tab snapshot — exported so component selectors get a stable
 * reference instead of building a new object every render. */
export { EMPTY_TAB };
