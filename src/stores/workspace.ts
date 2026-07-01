import { create } from 'zustand';
import type { CanvasEdge, CanvasNote, CanvasRect, CanvasState, CanvasTask, PaneLeaf, PaneNode, PaneSplit, PersistedWorkspace, Tab } from '@shared/types';
import { addLeaf, closeLeaf, collectLeaves, emptyLeaf, newId, setSplitSizes, splitLeaf, swapLeaves, updateLeaf, type SplitPosition } from '@/lib/layoutTree';
import type { LayoutId } from '@/components/LayoutPickerModal';
import { PERSONAS as SQUAD_PERSONAS, personaCommand, MAESTRO_ID } from '@/lib/personaCatalog';
import { squadSlot } from '@/lib/squadLayout';

/** Clona um nó com ids novos e sem terminalId — para reabrir uma aba fechada
 *  como cópia "fresca" (os PTYs antigos já foram encerrados ao fechar). */
function rebuildNode(node: PaneNode): PaneNode {
  if (node.kind === 'split') {
    return { ...node, id: newId('split'), children: node.children.map(rebuildNode) };
  }
  return { ...node, id: newId('pane'), terminalId: null };
}

interface WorkspaceStore {
  tabs: Tab[];
  activeTabId: string | null;
  closedTabs: Tab[];
  loaded: boolean;
  load: () => Promise<void>;
  persist: () => void;

  newTab: (title?: string, leaf?: PaneLeaf) => string;
  /** Manda cada painel splitado da aba para uma aba própria (não fecha nada). */
  splitToTabs: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  /** Reabre a última aba fechada (Ctrl+Shift+T) com os mesmos projetos/layout. */
  reopenLastClosedTab: () => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  /** Define nome e/ou cor customizados da aba (duplo-clique no título). */
  setTabCustom: (tabId: string, patch: { customTitle?: string; color?: string }) => void;
  /** Liga/desliga a entrada sincronizada (broadcast) entre os terminais da aba. */
  toggleBroadcast: (tabId: string) => void;

  splitPane: (tabId: string, paneId: string, orientation: 'horizontal' | 'vertical', position?: SplitPosition) => void;
  /** Split, seeding the new pane with the source pane's project + a view mode. */
  splitPaneWith: (
    tabId: string,
    paneId: string,
    orientation: 'horizontal' | 'vertical',
    position: SplitPosition,
    viewMode: 'terminal' | 'browser',
  ) => void;
  closePane: (tabId: string, paneId: string) => void;
  updatePane: (tabId: string, paneId: string, patch: Partial<PaneLeaf>) => void;
  setSplitSizes: (tabId: string, splitId: string, sizes: number[]) => void;

  openProjectInNewTab: (projectName: string, projectPath: string) => string;
  /** Abre o projeto numa nova aba e retoma a sessão do Claude assim que o
   *  terminal subir. */
  openProjectAndResume: (projectName: string, projectPath: string, sessionId: string) => string;
  /** Abre um terminal já vinculado a uma conta e roda o Claude (fluxo de login). */
  openLoginTerminal: (accountId: string, label: string, cwd: string) => string;
  openProjectInPane: (tabId: string, paneId: string, projectName: string, projectPath: string) => void;
  /** Esquadrão: abre um terminal rodando um agente (persona) numa nova aba. */
  openAgent: (command: string, label: string, projectName: string | null, projectPath: string | null, personaId?: string) => string;
  /** Esquadrão: "explode" uma persona num split ao lado do pane, herdando o projeto. */
  explodeAgent: (tabId: string, paneId: string, command: string, label: string, personaId?: string) => void;
  /** Esquadrão: abre (ou foca) a aba do Canvas de Orquestração para um projeto. */
  openSquadCanvas: (projectName: string | null, projectPath: string | null) => string;
  /** Esquadrão: ativa uma persona "aguardando" — abre o terminal dela no slot do canvas. */
  activateSquadPersona: (tabId: string, personaId: string) => string;
  /** Esquadrão: adiciona uma persona como painel DENTRO da aba do Canvas (dock). */
  addSquadAgent: (tabId: string, command: string, label: string, personaId: string) => string;
  newTabWithLayout: (layoutId: LayoutId, slots: { name: string; path: string }[]) => string;
  /** Substitui todas as abas (ex.: ao aplicar um perfil de workspace). */
  replaceTabs: (tabs: Tab[], activeTabId: string | null) => void;
  /** Abre o Browser do projeto num split à direita do terminal (idempotente). */
  openBrowserBeside: (tabId: string, sourcePaneId: string, projectName: string, projectPath: string, url?: string) => void;
  /**
   * Abre o site do dev server da melhor forma: se já há um Browser do projeto,
   * atualiza a URL; se há um terminal do projeto, abre o Browser ao lado; se
   * não há nenhuma aba do projeto, abre uma NOVA aba só com o site.
   */
  openDevBrowser: (projectName: string, projectPath: string, url: string) => void;

  /** Último painel focado por aba (volátil, não persistido). Usado para saber
   *  qual painel dividir ao abrir uma subpasta como novo terminal. */
  activePaneByTab: Record<string, string>;
  setActivePane: (tabId: string, paneId: string) => void;
  /** Abre uma subpasta como um novo terminal, dividindo o painel ativo da aba. */
  openFolderInSplit: (tabId: string, folderName: string, folderPath: string) => void;

  // ===== Árvore de arquivos (controlada pelo header de cada terminal) =====
  /** Árvore oculta? (preferência persistida) */
  treeHidden: boolean;
  /** Projeto cuja árvore está sendo exibida (null = nenhum). */
  treeProject: { path: string; name: string } | null;
  /** Abre/troca a árvore para o projeto dado; se já é o atual e visível, oculta. */
  toggleTreeFor: (path: string, name: string) => void;
  setTreeHidden: (v: boolean) => void;
  setTreeProject: (p: { path: string; name: string } | null) => void;

  // ===== Drag-and-drop de reordenação de painéis =====
  /** Painel sendo arrastado no momento (volátil). */
  draggingPaneId: string | null;
  setDraggingPane: (id: string | null) => void;
  /** Troca a posição de dois painéis na árvore da aba. */
  swapPanes: (tabId: string, idA: string, idB: string) => void;
  /** Projeto sendo arrastado da sidebar (volátil) — ativa as zonas de drop nos painéis. */
  draggingProject: { path: string; name: string } | null;
  setDraggingProject: (p: { path: string; name: string } | null) => void;
  /** Divide um painel abrindo um terminal do projeto na direção dada (drag-and-drop). */
  splitWithProject: (tabId: string, paneId: string, orientation: 'horizontal' | 'vertical', position: SplitPosition, projectName: string, projectPath: string) => void;

  // ===== Canvas (visão livre de terminais + notas + conexões) =====
  setCanvasMode: (tabId: string, on: boolean) => void;
  setCanvasViewport: (tabId: string, vp: { x: number; y: number; zoom: number }) => void;
  setCanvasRect: (tabId: string, leafId: string, rect: CanvasRect) => void;
  addCanvasTerminal: (tabId: string, rect: CanvasRect, project?: { name: string; path: string }) => void;
  addCanvasNote: (tabId: string, note: CanvasNote) => void;
  updateCanvasNote: (tabId: string, id: string, patch: Partial<CanvasNote>) => void;
  removeCanvasNote: (tabId: string, id: string) => void;
  addCanvasEdge: (tabId: string, from: string, to: string) => void;
  removeCanvasEdge: (tabId: string, id: string) => void;
  // Lista de tarefas (to-do) por terminal:
  addCanvasTask: (tabId: string, leafId: string, text: string) => void;
  updateCanvasTask: (tabId: string, leafId: string, taskId: string, patch: Partial<CanvasTask>) => void;
  removeCanvasTask: (tabId: string, leafId: string, taskId: string) => void;
}

const DEFAULT_CANVAS: CanvasState = { positions: {}, notes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };

function withCanvas(t: Tab, fn: (c: CanvasState) => CanvasState): Tab {
  return { ...t, canvas: fn(t.canvas ?? DEFAULT_CANVAS) };
}

function readTreeHidden(): boolean {
  try { return localStorage.getItem('voltz-tree-hidden') === '1'; } catch { return false; }
}
function writeTreeHidden(v: boolean) {
  try { localStorage.setItem('voltz-tree-hidden', v ? '1' : '0'); } catch { /* ignore */ }
}

/** Versão do schema do workspace persistido. Aumente ao mudar o formato. */
const WORKSPACE_VERSION = 1;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(get: () => WorkspaceStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { tabs, activeTabId } = get();
    const payload: PersistedWorkspace = { version: WORKSPACE_VERSION, tabs, activeTabId };
    window.api.store.set('workspace', payload);
  }, 400);
}

/** Valida recursivamente um nó da árvore de painéis vindo do disco. */
function isValidNode(node: unknown): node is PaneNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (n.kind === 'pane') return typeof n.id === 'string';
  if (n.kind === 'split') {
    return typeof n.id === 'string'
      && Array.isArray(n.children)
      && n.children.length > 0
      && n.children.every(isValidNode);
  }
  return false;
}

/**
 * Filtra abas carregadas do disco: descarta as malformadas (JSON corrompido,
 * formato de versão antiga) e zera os ids de terminal. Nunca lança — um store
 * corrompido não pode travar o boot na tela de carregamento.
 */
/**
 * Ao restaurar a aba do Esquadrão, mantém só o MAESTRO (as demais personas
 * voltam como "aguardando") — evita subir 9 sessões do Claude no boot.
 */
function pruneSquadRoot(root: PaneNode): PaneNode {
  const leaves = collectLeaves(root);
  const keep = leaves.find((l) => l.personaId === MAESTRO_ID)
    ?? leaves.find((l) => l.projectPath)
    ?? leaves[0];
  return keep ? { ...keep, terminalId: null } : root;
}

function sanitizeTabs(raw: unknown): Tab[] {
  if (!Array.isArray(raw)) return [];
  const out: Tab[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const tab = item as Partial<Tab>;
    if (typeof tab.id !== 'string' || !isValidNode(tab.root)) continue;
    if ((tab as Tab).squad) {
      const pruned = pruneSquadRoot(tab.root as PaneNode);
      const keepId = collectLeaves(pruned)[0]?.id;
      out.push({
        ...(tab as Tab),
        root: pruned,
        canvas: keepId
          ? { positions: { [keepId]: squadSlot(MAESTRO_ID) }, notes: [], edges: [], viewport: (tab as Tab).canvas?.viewport ?? { x: 0, y: 0, zoom: 0.58 } }
          : (tab as Tab).canvas,
      });
      continue;
    }
    out.push({ ...(tab as Tab), root: clearTerminalIds(tab.root as PaneNode) });
  }
  return out;
}

function updateTab(tabs: Tab[], tabId: string, fn: (t: Tab) => Tab): Tab[] {
  return tabs.map((t) => (t.id === tabId ? fn(t) : t));
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  closedTabs: [],
  loaded: false,
  activePaneByTab: {},

  async load() {
    let stored: PersistedWorkspace | undefined;
    try {
      stored = await window.api.store.get<PersistedWorkspace>('workspace');
    } catch {
      stored = undefined;
    }
    const cleaned = sanitizeTabs(stored?.tabs);
    if (cleaned.length > 0) {
      const stillExists = stored?.activeTabId && cleaned.some((t) => t.id === stored!.activeTabId);
      set({ tabs: cleaned, activeTabId: stillExists ? stored!.activeTabId! : cleaned[0].id, loaded: true });
    } else {
      set({ tabs: [], activeTabId: null, loaded: true });
    }
  },

  persist() {
    schedulePersist(get);
  },

  newTab(title = 'Novo', leaf) {
    const tab: Tab = {
      id: newId('tab'),
      title,
      root: leaf || emptyLeaf(),
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    schedulePersist(get);
    return tab.id;
  },

  splitToTabs(tabId) {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const leaves = collectLeaves(tab.root);
    if (leaves.length <= 1) return; // sem split, nada a fazer
    const [first, ...rest] = leaves;
    const labelFor = (l: PaneLeaf) => l.customTitle || l.projectName || l.title || 'Terminal';
    // Cada painel extra vira uma aba própria (preserva os ids → não mata o terminal).
    const extra: Tab[] = rest.map((l) => ({ id: newId('tab'), title: labelFor(l), root: l }));
    const tabs = state.tabs.map((t) => (t.id === tabId ? { ...t, root: first } : t));
    const idx = tabs.findIndex((t) => t.id === tabId);
    tabs.splice(idx + 1, 0, ...extra);
    set({ tabs, activeTabId: tabId });
    schedulePersist(get);
  },

  closeTab(tabId) {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const tab = state.tabs[idx];
    // Snapshot para reabrir (Ctrl+Shift+T): ids novos e sem terminalId — os PTYs
    // são encerrados abaixo, então reabre como cópia fresca dos mesmos projetos.
    const snapshot: Tab = { ...tab, id: newId('tab'), root: rebuildNode(tab.root) };
    const closedTabs = [...state.closedTabs, snapshot].slice(-10);
    for (const leaf of collectLeaves(tab.root)) {
      if (leaf.terminalId) window.api.pty.kill(leaf.terminalId);
    }
    const tabs = state.tabs.filter((t) => t.id !== tabId);
    let activeTabId = state.activeTabId;
    if (state.activeTabId === tabId) {
      activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
    }
    set({ tabs, activeTabId, closedTabs });
    schedulePersist(get);
  },

  reopenLastClosedTab() {
    const stack = get().closedTabs;
    if (stack.length === 0) return;
    const tab = stack[stack.length - 1];
    set((s) => ({ closedTabs: s.closedTabs.slice(0, -1), tabs: [...s.tabs, tab], activeTabId: tab.id }));
    schedulePersist(get);
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId });
    schedulePersist(get);
  },

  renameTab(tabId, title) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, title })) }));
    schedulePersist(get);
  },

  setTabCustom(tabId, patch) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, ...patch })) }));
    schedulePersist(get);
  },

  toggleBroadcast(tabId) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, broadcast: !t.broadcast })) }));
    schedulePersist(get);
  },

  splitPane(tabId, paneId, orientation, position = 'after') {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, root: splitLeaf(t.root, paneId, orientation, position) })),
    }));
    schedulePersist(get);
  },

  splitPaneWith(tabId, paneId, orientation, position, viewMode) {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => {
        const src = collectLeaves(t.root).find((l) => l.id === paneId);
        const seeded: PaneLeaf = {
          ...emptyLeaf(),
          projectPath: src?.projectPath ?? null,
          projectName: src?.projectName ?? null,
          viewMode,
        };
        return { ...t, root: splitLeaf(t.root, paneId, orientation, position, seeded) };
      }),
    }));
    schedulePersist(get);
  },

  closePane(tabId, paneId) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const leaf = collectLeaves(tab.root).find((l) => l.id === paneId);
    if (leaf?.terminalId) window.api.pty.kill(leaf.terminalId);
    const newRoot = closeLeaf(tab.root, paneId);
    if (!newRoot) {
      get().closeTab(tabId);
      return;
    }
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, root: newRoot })) }));
    schedulePersist(get);
  },

  updatePane(tabId, paneId, patch) {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, root: updateLeaf(t.root, paneId, patch) })),
    }));
    schedulePersist(get);
  },

  setSplitSizes(tabId, splitId, sizes) {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, root: setSplitSizes(t.root, splitId, sizes) })),
    }));
    schedulePersist(get);
  },

  replaceTabs(tabs, activeTabId) {
    // Mata os PTYs das abas atuais (serão substituídas).
    for (const t of get().tabs) {
      for (const leaf of collectLeaves(t.root)) {
        if (leaf.terminalId) window.api.pty.kill(leaf.terminalId);
      }
    }
    const cleaned = tabs.map((t) => ({ ...t, root: clearTerminalIds(t.root) }));
    const active = activeTabId && cleaned.some((t) => t.id === activeTabId)
      ? activeTabId
      : (cleaned[0]?.id ?? null);
    set({ tabs: cleaned, activeTabId: active });
    schedulePersist(get);
  },

  openBrowserBeside(tabId, sourcePaneId, projectName, projectPath, url) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Já existe um Browser deste projeto na aba? Reaproveita (atualiza a URL).
    const existing = collectLeaves(tab.root).find((l) => l.viewMode === 'browser' && l.projectPath === projectPath);
    if (existing) {
      if (url) get().updatePane(tabId, existing.id, { browserUrl: url });
      return;
    }
    const seeded: PaneLeaf = {
      ...emptyLeaf(),
      projectPath,
      projectName,
      title: projectName,
      viewMode: 'browser',
      browserUrl: url,
    };
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({
        ...t,
        root: splitLeaf(t.root, sourcePaneId, 'vertical', 'after', seeded),
      })),
    }));
    schedulePersist(get);
  },

  openDevBrowser(projectName, projectPath, url) {
    const tabs = get().tabs;
    // 1) Já existe um Browser deste projeto? Atualiza a URL e foca a aba.
    for (const tab of tabs) {
      const browserLeaf = collectLeaves(tab.root).find(
        (l) => l.viewMode === 'browser' && l.projectPath === projectPath,
      );
      if (browserLeaf) {
        get().updatePane(tab.id, browserLeaf.id, { browserUrl: url });
        set({ activeTabId: tab.id });
        schedulePersist(get);
        return;
      }
    }
    // 2) Há um terminal deste projeto? Abre o Browser ao lado.
    for (const tab of tabs) {
      const termLeaf = collectLeaves(tab.root).find(
        (l) => l.viewMode !== 'browser' && l.projectPath === projectPath,
      );
      if (termLeaf) {
        get().openBrowserBeside(tab.id, termLeaf.id, projectName, projectPath, url);
        set({ activeTabId: tab.id });
        return;
      }
    }
    // 3) Nenhuma aba do projeto → abre uma nova aba só com o site.
    const leaf: PaneLeaf = {
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath,
      projectName,
      title: projectName,
      viewMode: 'browser',
      browserUrl: url,
    };
    get().newTab(projectName, leaf);
  },

  openProjectInNewTab(projectName, projectPath) {
    const leaf: PaneLeaf = {
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath,
      projectName,
      title: projectName,
    };
    return get().newTab(projectName, leaf);
  },

  openProjectAndResume(projectName, projectPath, sessionId) {
    const leaf: PaneLeaf = {
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath,
      projectName,
      title: projectName,
      resumeSessionId: sessionId,
    };
    return get().newTab(projectName, leaf);
  },

  openLoginTerminal(accountId, label, cwd) {
    const leaf: PaneLeaf = {
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath: cwd,
      projectName: label,
      title: `Login · ${label}`,
      claudeAccountId: accountId,
      autoStartClaude: true,
    };
    return get().newTab(`Login · ${label}`, leaf);
  },

  openProjectInPane(tabId, paneId, projectName, projectPath) {
    get().updatePane(tabId, paneId, {
      projectPath,
      projectName,
      title: projectName,
      terminalId: null,
    });
  },

  setActivePane(tabId, paneId) {
    set((s) => (s.activePaneByTab[tabId] === paneId
      ? s
      : { activePaneByTab: { ...s.activePaneByTab, [tabId]: paneId } }));
  },

  treeHidden: readTreeHidden(),
  treeProject: null,

  toggleTreeFor(path, name) {
    const st = get();
    const showingThis = !st.treeHidden && st.treeProject?.path === path;
    if (showingThis) {
      writeTreeHidden(true);
      set({ treeHidden: true });
    } else {
      writeTreeHidden(false);
      set({ treeHidden: false, treeProject: { path, name } });
    }
  },
  setTreeHidden(v) {
    writeTreeHidden(v);
    set({ treeHidden: v });
  },
  setTreeProject(p) {
    set({ treeProject: p });
  },

  draggingPaneId: null,
  setDraggingPane(id) {
    set({ draggingPaneId: id });
  },
  swapPanes(tabId, idA, idB) {
    if (idA === idB) return;
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, root: swapLeaves(t.root, idA, idB) })) }));
    schedulePersist(get);
  },

  draggingProject: null,
  setDraggingProject(p) {
    set({ draggingProject: p });
  },
  splitWithProject(tabId, paneId, orientation, position, projectName, projectPath) {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => {
        const seeded: PaneLeaf = {
          ...emptyLeaf(),
          projectPath,
          projectName,
          title: projectName,
          viewMode: 'terminal',
        };
        return { ...t, root: splitLeaf(t.root, paneId, orientation, position, seeded) };
      }),
    }));
    schedulePersist(get);
  },

  openAgent(command, label, projectName, projectPath, personaId) {
    const leaf: PaneLeaf = {
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath,
      projectName,
      title: label,
      viewMode: 'terminal',
      autoRunCommand: command,
      personaId,
    };
    return get().newTab(label, leaf);
  },
  explodeAgent(tabId, paneId, command, label, personaId) {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => {
        const src = collectLeaves(t.root).find((l) => l.id === paneId);
        const seeded: PaneLeaf = {
          ...emptyLeaf(),
          projectPath: src?.projectPath ?? null,
          projectName: src?.projectName ?? null,
          title: label,
          viewMode: 'terminal',
          autoRunCommand: command,
          personaId,
        };
        return { ...t, root: splitLeaf(t.root, paneId, 'vertical', 'after', seeded) };
      }),
    }));
    schedulePersist(get);
  },
  openSquadCanvas(projectName, projectPath) {
    // Se já existe o canvas do Esquadrão montado, só ativa.
    const existing = get().tabs.find((t) => t.squad);
    if (existing && existing.canvasMode && collectLeaves(existing.root).some((l) => l.personaId)) {
      set({ activeTabId: existing.id });
      return existing.id;
    }

    // Só o MAESTRO sobe como terminal (economia). As outras 8 personas ficam como
    // "aguardando" (placeholders no overlay) e viram terminal ao serem ativadas.
    const m = SQUAD_PERSONAS.find((x) => x.id === MAESTRO_ID)!;
    const maestro: PaneLeaf = {
      kind: 'pane', id: newId('pane'), terminalId: null,
      projectPath, projectName,
      title: `${m.emoji} ${m.name}`,
      customColor: m.color,
      viewMode: 'terminal',
      autoRunCommand: personaCommand(MAESTRO_ID),
      personaId: MAESTRO_ID,
    };
    const canvas: CanvasState = { positions: { [maestro.id]: squadSlot(MAESTRO_ID) }, notes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.58 } };

    if (existing) {
      for (const l of collectLeaves(existing.root)) if (l.terminalId) { try { window.api.pty.kill(l.terminalId); } catch { /* ignore */ } }
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === existing.id ? { id: t.id, title: 'Esquadrão', root: maestro, canvas, canvasMode: true, squad: true } : t)), activeTabId: existing.id }));
      schedulePersist(get);
      return existing.id;
    }
    const tab: Tab = { id: newId('tab'), title: 'Esquadrão', root: maestro, canvas, canvasMode: true, squad: true };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    schedulePersist(get);
    return tab.id;
  },
  activateSquadPersona(tabId, personaId) {
    const t = get().tabs.find((x) => x.id === tabId);
    if (!t) return '';
    const existing = collectLeaves(t.root).find((l) => l.personaId === personaId);
    if (existing) return existing.id;
    const meta = SQUAD_PERSONAS.find((x) => x.id === personaId);
    const seed = collectLeaves(t.root).find((l) => l.projectPath);
    const leaf: PaneLeaf = {
      ...emptyLeaf(),
      projectPath: seed?.projectPath ?? null,
      projectName: seed?.projectName ?? null,
      title: meta ? `${meta.emoji} ${meta.name}` : personaId,
      customColor: meta?.color,
      viewMode: 'terminal',
      autoRunCommand: personaCommand(personaId),
      personaId,
    };
    const rect = squadSlot(personaId);
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (tt) => withCanvas({ ...tt, root: addLeaf(tt.root, leaf) }, (c) => ({ ...c, positions: { ...c.positions, [leaf.id]: rect } }))) }));
    schedulePersist(get);
    return leaf.id;
  },
  addSquadAgent(tabId, command, label, personaId) {
    const t = get().tabs.find((x) => x.id === tabId);
    const existing = t ? collectLeaves(t.root).find((l) => l.personaId === personaId) : undefined;
    if (existing) return existing.id;
    const seed = t ? collectLeaves(t.root).find((l) => l.projectPath) : undefined;
    const leaf: PaneLeaf = {
      ...emptyLeaf(),
      projectPath: seed?.projectPath ?? null,
      projectName: seed?.projectName ?? null,
      title: label,
      viewMode: 'terminal',
      autoRunCommand: command,
      personaId,
    };
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (tt) => ({ ...tt, root: addLeaf(tt.root, leaf) })) }));
    schedulePersist(get);
    return leaf.id;
  },

  setCanvasMode(tabId, on) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => {
      if (!on) return { ...t, canvasMode: false };
      // Auto-posiciona em grade os terminais que ainda não têm lugar no canvas.
      const cur = t.canvas ?? DEFAULT_CANVAS;
      const positions: Record<string, CanvasRect> = { ...cur.positions };
      const CW = 460, CH = 320, GAP = 44, COLS = 3;
      let placed = Object.keys(positions).length;
      for (const lf of collectLeaves(t.root)) {
        if (positions[lf.id]) continue;
        const col = placed % COLS, row = Math.floor(placed / COLS);
        positions[lf.id] = { x: 80 + col * (CW + GAP), y: 80 + row * (CH + GAP), w: CW, h: CH };
        placed++;
      }
      return { ...t, canvasMode: true, canvas: { ...cur, positions } };
    }) }));
    schedulePersist(get);
  },
  setCanvasViewport(tabId, vp) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({ ...c, viewport: vp }))) }));
    schedulePersist(get);
  },
  setCanvasRect(tabId, leafId, rect) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({ ...c, positions: { ...c.positions, [leafId]: rect } }))) }));
    schedulePersist(get);
  },
  addCanvasTerminal(tabId, rect, project) {
    const leaf: PaneLeaf = {
      ...emptyLeaf(),
      projectPath: project?.path ?? null,
      projectName: project?.name ?? null,
      title: project?.name ?? 'Novo terminal',
    };
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => {
      const withRoot = { ...t, root: addLeaf(t.root, leaf) };
      return withCanvas(withRoot, (c) => ({ ...c, positions: { ...c.positions, [leaf.id]: rect } }));
    }) }));
    schedulePersist(get);
  },
  addCanvasNote(tabId, note) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({ ...c, notes: [...c.notes, note] }))) }));
    schedulePersist(get);
  },
  updateCanvasNote(tabId, id, patch) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({ ...c, notes: c.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))) }));
    schedulePersist(get);
  },
  removeCanvasNote(tabId, id) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({
      ...c,
      notes: c.notes.filter((n) => n.id !== id),
      edges: c.edges.filter((e) => e.from !== id && e.to !== id),
    }))) }));
    schedulePersist(get);
  },
  addCanvasEdge(tabId, from, to) {
    if (from === to) return;
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => {
      if (c.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return c;
      const edge: CanvasEdge = { id: newId('edge'), from, to };
      return { ...c, edges: [...c.edges, edge] };
    })) }));
    schedulePersist(get);
  },
  removeCanvasEdge(tabId, id) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => ({ ...c, edges: c.edges.filter((e) => e.id !== id) }))) }));
    schedulePersist(get);
  },
  addCanvasTask(tabId, leafId, text) {
    const txt = text.trim();
    if (!txt) return;
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => {
      const tasks = { ...(c.tasks ?? {}) };
      tasks[leafId] = [...(tasks[leafId] ?? []), { id: newId('task'), text: txt, done: false }];
      return { ...c, tasks };
    })) }));
    schedulePersist(get);
  },
  updateCanvasTask(tabId, leafId, taskId, patch) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => {
      const tasks = { ...(c.tasks ?? {}) };
      tasks[leafId] = (tasks[leafId] ?? []).map((tk) => (tk.id === taskId ? { ...tk, ...patch } : tk));
      return { ...c, tasks };
    })) }));
    schedulePersist(get);
  },
  removeCanvasTask(tabId, leafId, taskId) {
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => withCanvas(t, (c) => {
      const tasks = { ...(c.tasks ?? {}) };
      tasks[leafId] = (tasks[leafId] ?? []).filter((tk) => tk.id !== taskId);
      return { ...c, tasks };
    })) }));
    schedulePersist(get);
  },

  openFolderInSplit(tabId, folderName, folderPath) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const leaves = collectLeaves(tab.root);
    if (leaves.length === 0) return;
    // Divide o painel focado da aba; se nenhum foi focado ainda, o último.
    const activeId = get().activePaneByTab[tabId];
    const target = leaves.find((l) => l.id === activeId) ?? leaves[leaves.length - 1];
    const seeded: PaneLeaf = {
      ...emptyLeaf(),
      projectPath: folderPath,
      projectName: folderName,
      title: folderName,
    };
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({
        ...t,
        root: splitLeaf(t.root, target.id, 'vertical', 'after', seeded),
      })),
      activePaneByTab: { ...s.activePaneByTab, [tabId]: seeded.id },
    }));
    schedulePersist(get);
  },

  newTabWithLayout(layoutId, slots) {
    const leaves: PaneLeaf[] = slots.map((s) => ({
      kind: 'pane',
      id: newId('pane'),
      terminalId: null,
      projectPath: s.path || null,
      projectName: s.name || null,
      title: s.name || 'Novo terminal',
    }));

    function sp(o: 'horizontal' | 'vertical', sizes: number[], children: PaneNode[]): PaneSplit {
      return { kind: 'split', id: newId('split'), orientation: o, sizes, children };
    }
    const even = (n: number) => Array.from({ length: n }, () => 100 / n);
    const gridNode = (rows: number, cols: number, cells: PaneNode[]): PaneNode =>
      sp('horizontal', even(rows), Array.from({ length: rows }, (_, r) =>
        sp('vertical', even(cols), cells.slice(r * cols, r * cols + cols))));

    let root: PaneNode;
    switch (layoutId) {
      case 'h2':   root = sp('vertical',   [50, 50],             [leaves[0], leaves[1]]); break;
      case 'v2':   root = sp('horizontal', [50, 50],             [leaves[0], leaves[1]]); break;
      case 'h3':   root = sp('vertical',   [33.33, 33.33, 33.34],[leaves[0], leaves[1], leaves[2]]); break;
      case 'l1r2': root = sp('vertical',   [50, 50],             [leaves[0], sp('horizontal', [50, 50], [leaves[1], leaves[2]])]); break;
      case 'quad': root = sp('vertical',   [50, 50],             [sp('horizontal', [50, 50], [leaves[0], leaves[1]]), sp('horizontal', [50, 50], [leaves[2], leaves[3]])]); break;
      case 'g3':   root = gridNode(3, 3, leaves); break;
      case 'g4':   root = gridNode(4, 4, leaves); break;
      case 'g6':   root = gridNode(6, 6, leaves); break;
      default:     root = leaves[0];
    }

    const title = slots.find((s) => s.name)?.name ?? 'Layout';
    const tab: Tab = { id: newId('tab'), title, root };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    schedulePersist(get);
    return tab.id;
  },
}));

function clearTerminalIds(node: PaneNode): PaneNode {
  if (node.kind === 'pane') return { ...node, terminalId: null };
  return { ...node, children: node.children.map(clearTerminalIds) };
}
