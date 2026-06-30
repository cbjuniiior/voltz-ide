export type ShellKind = 'pwsh' | 'cmd' | 'bash' | 'zsh';

/** Estado do auto-update, enviado do main para a UI. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  /** 0–100, durante 'downloading'. */
  percent?: number;
  message?: string;
}

/** Repositório do GitHub retornado pela listagem (para clonar). */
export interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  sshUrl: string;
  /** ISO de pushed_at/updated_at, para ordenar. */
  updatedAt: string | null;
}

/** Como uma skill global é baixada do GitHub e materializada em <configDir>/skills/. */
export type GlobalInstallSpec =
  | { mode: 'folder'; id: string; owner: string; repo: string; branch: string; path: string; mdOnly?: boolean }
  | { mode: 'folder-of-skills'; owner: string; repo: string; branch: string; path: string; only?: string[] }
  | { mode: 'design-file'; id: string; label: string; owner: string; repo: string; branch: string; path: string };

export interface ProjectCustomization {
  /** key = project.path */
  alias?: string;
  emoji?: string;
  color?: string;   // hex border color override
  favorite: boolean;
  /** Tags/categorias do projeto (ex.: 'plugins', 'sistemas'). Filtros da sidebar. */
  tags?: string[];
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  rootFolder: string;
  isGit: boolean;
}

export interface PtyCreateOptions {
  id: string;
  cwd: string;
  shell: ShellKind;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface ClaudeDetectResult {
  path: string | null;
  source: 'where' | 'localappdata' | 'npm' | 'bun' | 'manual' | 'none';
}

export type DevServerPhase = 'idle' | 'installing' | 'starting' | 'running' | 'error' | 'stopped';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface DevServerState {
  projectPath: string;
  phase: DevServerPhase;
  pm: PackageManager;
  url: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  recentLog: string[];
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface RecentProject {
  /** Caminho absoluto da pasta aberta de forma avulsa. */
  path: string;
  /** Nome exibido (nome da pasta). */
  name: string;
}

export interface Settings {
  rootFolders: string[];
  claudePath: string | null;
  claudeCommand: string;
  defaultShell: ShellKind;
  fontSize: number;
  theme: ThemeMode;
  /** Default terminal theme ID — applied to every new pane unless overridden. */
  terminalTheme: string;
  /** Família de fonte do terminal (CSS font-family). Vazio = padrão do app. */
  terminalFontFamily: string;
  /** Estilo do cursor do terminal. */
  terminalCursorStyle: 'bar' | 'block' | 'underline';
  /** Cursor do terminal pisca. */
  terminalCursorBlink: boolean;
  /** Auto-save changes to disk after a short debounce. */
  editorAutoSave: boolean;
  /** Auto-save debounce delay (ms). */
  editorAutoSaveDelayMs: number;
  whisperApiKey: string | null;
  whisperApiBase: string;
  whisperModel: string;
  /** Mostra a notificação nativa do SO quando o Claude termina/aguarda (fora desta aba). */
  notifyClaudeIdle: boolean;
  /** Toca um som curto quando o Claude termina/aguarda (fora desta aba). */
  soundClaudeIdle: boolean;
  /** Abre o Browser interno automaticamente quando o dev server expõe a URL. */
  autoOpenBrowserOnDev: boolean;
  /** Pastas abertas via "Abrir pasta…" — atalho de reabertura, não viram raiz escaneada. */
  recentProjects: RecentProject[];
}

/** Tipo de conteúdo que um painel exibe. `undefined` = slot vazio (escolher tipo). */
export type PaneViewMode = 'terminal' | 'browser' | 'video';

export interface PaneLeaf {
  kind: 'pane';
  id: string;
  terminalId: string | null;
  projectPath: string | null;
  projectName: string | null;
  title: string;
  /** Nome customizado do terminal (duplo-clique no título). Sobrepõe projectName na exibição. */
  customTitle?: string;
  /** Cor customizada do terminal (hex). Sobrepõe a cor automática/do projeto. */
  customColor?: string;
  /** Optional per-pane terminal theme override; falls back to settings default. */
  terminalTheme?: string;
  /** Which surface the pane shows. All stay mounted; this toggles visibility. */
  viewMode?: PaneViewMode;
  /** Last URL loaded in the browser pane (persisted). */
  browserUrl?: string;
  /** Fonte de vídeo (viewMode 'video'), persistida no painel. */
  video?: { source: 'url' | 'file'; src: string; posSeconds?: number; title?: string };
  /** Sessão do Claude a retomar assim que o terminal subir (consumido 1x). */
  resumeSessionId?: string;
  /** Conta do Claude usada neste terminal (id no store de contas). Vazio = padrão. */
  claudeAccountId?: string;
  /** Inicia o Claude automaticamente quando o terminal sobe (consumido 1x). */
  autoStartClaude?: boolean;
  /** Roda um comando de agente (codex/gemini/qwen…) ao subir o terminal (consumido 1x). */
  autoRunCommand?: string;
}

export interface PaneSplit {
  kind: 'split';
  id: string;
  orientation: 'horizontal' | 'vertical';
  sizes: number[];
  children: PaneNode[];
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  /** Nome customizado da aba (duplo-clique). Sobrepõe o nome do projeto. */
  customTitle?: string;
  /** Cor customizada da aba (hex). Sobrepõe a cor automática/do projeto. */
  color?: string;
  /** Exibe a aba como um canvas livre (em vez do layout em grade). */
  canvasMode?: boolean;
  /** Estado do canvas (posições, notas, conexões, viewport). */
  canvas?: CanvasState;
  /**
   * Entrada sincronizada: o que você digita/cola em QUALQUER terminal desta aba
   * é espelhado para todos os outros terminais dela (estilo tmux
   * "synchronize-panes"). Pensado para tocar vários agentes Claude de uma vez.
   */
  broadcast?: boolean;
}

export interface CanvasRect { x: number; y: number; w: number; h: number; }

/** Card de texto/tarefa no canvas — o terminal conectado executa. */
export interface CanvasNote {
  id: string;
  x: number; y: number; w: number; h: number;
  text: string;
  /** Cor de destaque (hex) — opcional. */
  color?: string;
  /** Tarefa já concluída (✓ na lista). */
  done?: boolean;
}

/** Ligação entre dois itens do canvas (terminais ou notas), por id. */
export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
}

/** Item da lista de tarefas (to-do) de um terminal. */
export interface CanvasTask {
  id: string;
  text: string;
  done: boolean;
}

export interface CanvasState {
  /** Posição/tamanho de cada terminal, indexado pelo id do PaneLeaf. */
  positions: Record<string, CanvasRect>;
  notes: CanvasNote[];
  edges: CanvasEdge[];
  /** Lista de tarefas por terminal (id do PaneLeaf → tarefas em ordem). */
  tasks?: Record<string, CanvasTask[]>;
  /** Pan + zoom atuais do plano. */
  viewport: { x: number; y: number; zoom: number };
}

export interface PersistedWorkspace {
  /** Versão do schema persistido — permite migrar ou descartar dados incompatíveis. */
  version?: number;
  tabs: Tab[];
  activeTabId: string | null;
}

export interface SearchMatchLite {
  file: string;
  line: number;
  col: number;
  preview: string;
}

export interface GitFileStatus {
  path: string;
  /** Status no índice (staged): M/A/D/R/C/' '… */
  index: string;
  /** Status na árvore de trabalho: M/D/?/' '… */
  work: string;
}

export interface IpcApi {
  pty: {
    create: (opts: PtyCreateOptions) => Promise<{ ok: true } | { ok: false; error: string }>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    onData: (cb: (id: string, data: string) => void) => () => void;
    onExit: (cb: (id: string, code: number) => void) => () => void;
  };
  projects: {
    scan: (roots: string[]) => Promise<Project[]>;
    readDir: (dirPath: string) => Promise<DirEntry[]>;
  };
  clipboard: {
    getImage: () => Promise<{ png: string } | null>;
    saveImage: (base64: string, ext: string) => Promise<string>;
    writeText: (text: string) => Promise<boolean>;
    readText: () => Promise<string>;
  };
  transcribe: {
    audio: (audioBase64: string, mime: string, opts: { apiKey: string; apiBase: string; model: string; language?: string }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  };
  claude: {
    detect: () => Promise<ClaudeDetectResult>;
    sessions: (projectPath: string, configDir?: string) => Promise<Array<{ id: string; preview: string; mtimeMs: number; configDir: string }>>;
    allSessions: (limit?: number, configDirs?: string[]) => Promise<Array<{ id: string; preview: string; mtimeMs: number; cwd: string | null; projectName: string }>>;
    usage: (configDir?: string) => Promise<{
      ok: boolean;
      windows: Array<{ key: string; label: string; utilization: number; resetsAt: string | null }>;
      extraUsage?: { enabled: boolean; utilization: number | null } | null;
      error?: string;
    }>;
    currentModel: (projectPath: string, configDir?: string) => Promise<string | null>;
    /** Marca o projeto como confiável no .claude.json da conta (envConfigDir vazio = principal). */
    trustProject: (projectPath: string, envConfigDir?: string) => Promise<void>;
    /** Gera uma mensagem de commit a partir do diff (roda `claude -p`). */
    commitMessage: (opts: { diff: string; cwd: string; configDir?: string }) =>
      Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  };
  accounts: {
    defaultDir: () => Promise<string>;
    createDir: (id: string) => Promise<string>;
    removeDir: (dir: string) => Promise<void>;
    identity: (dir: string) => Promise<{
      connected: boolean;
      tier: string | null;
      planLabel: string | null;
      email: string | null;
      orgName: string | null;
      expiresAt: number | null;
    }>;
  };
  dialog: {
    pickFolder: () => Promise<string | null>;
    /** Seleciona um arquivo (com filtros opcionais de extensão). */
    pickFile: (opts?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  };
  store: {
    get: <T = unknown>(key: string) => Promise<T | undefined>;
    set: (key: string, value: unknown) => Promise<void>;
    /** Disparado quando OUTRA janela altera uma chave — para sincronização. */
    onChanged: (cb: (key: string, value: unknown) => void) => () => void;
  };
  pip: {
    /** Abre (ou foca) a janela flutuante de Tarefas, sempre no topo. */
    openTasks: () => Promise<{ ok: true } | { ok: false; error: string }>;
    /** Fecha a janela flutuante de Tarefas. */
    closeTasks: () => Promise<void>;
    /** Notifica a janela principal quando a janela flutuante é fechada. */
    onClosed: (cb: () => void) => () => void;
    /** Pede à janela principal para abrir um projeto (usado a partir da PiP). */
    openProjectInMain: (name: string, projectPath: string) => Promise<void>;
    /** Recebido na janela principal: abrir o projeto solicitado. */
    onOpenProject: (cb: (name: string, projectPath: string) => void) => () => void;
  };
  devServer: {
    start: (projectPath: string, opts?: { skipInstall?: boolean; script?: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
    stop: (projectPath: string) => Promise<void>;
    status: (projectPath: string) => Promise<DevServerState | null>;
    listAll: () => Promise<DevServerState[]>;
    scripts: (projectPath: string) => Promise<string[]>;
    openUrl: (url: string) => Promise<void>;
    onUpdate: (cb: (state: DevServerState) => void) => () => void;
  };
  skills: {
    install: (projectPath: string, skillId: string, body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    listInstalled: (projectPath: string) => Promise<string[]>;
    uninstall: (projectPath: string, skillId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    /** Lista ids de skills globais instaladas no config dir de uma conta. */
    listGlobal: (configDir: string) => Promise<string[]>;
    /** Baixa do GitHub e instala uma skill em todos os config dirs informados. */
    installGlobalFromRepo: (spec: GlobalInstallSpec, dirs: string[]) =>
      Promise<{ ok: true; installedIds: string[]; accounts: number } | { ok: false; error: string }>;
    /** Remove skills globais (ids) de todos os config dirs informados. */
    uninstallGlobal: (skillIds: string[], dirs: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  };
  updates: {
    /** Recebe atualizações de estado do auto-update. Retorna unsubscribe. */
    onStatus: (cb: (status: UpdateStatus) => void) => () => void;
    /** Versão atual do app instalado. */
    current: () => Promise<{ version: string }>;
    /** Dispara uma verificação manual de atualização. */
    check: () => Promise<void>;
    /** Reinicia e instala a atualização já baixada. */
    quitAndInstall: () => Promise<void>;
    /** Apenas dev: simula um update pra pré-visualizar o banner. */
    simulate: (version: string) => Promise<void>;
  };
  files: {
    stat: (root: string, target: string) => Promise<{ exists: boolean; isDir: boolean; size: number; mtimeMs: number }>;
    read: (root: string, target: string) => Promise<
      | { ok: true; content: string; mtimeMs: number; size: number }
      | { ok: false; error: string; binary?: boolean }
    >;
    /** Lê imagem/SVG como data URI base64 (para o visualizador). */
    readDataUrl: (root: string, target: string) => Promise<
      | { ok: true; dataUrl: string; mime: string; size: number }
      | { ok: false; error: string }
    >;
    write: (root: string, target: string, content: string, opts?: { expectedMtimeMs?: number }) => Promise<
      | { ok: true; mtimeMs: number; size: number }
      | { ok: false; error: string; code?: 'STALE'; currentMtimeMs?: number }
    >;
    create: (root: string, target: string, kind: 'file' | 'directory') => Promise<
      | { ok: true }
      | { ok: false; error: string; code?: 'EEXIST' }
    >;
    delete: (root: string, target: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    rename: (root: string, fromTarget: string, toTarget: string) => Promise<
      | { ok: true }
      | { ok: false; error: string; code?: 'EEXIST' }
    >;
    listAll: (root: string) => Promise<string[]>;
    search: (root: string, query: string, opts?: { caseSensitive?: boolean; maxResults?: number; regex?: boolean; wholeWord?: boolean }) => Promise<{ matches: SearchMatchLite[]; truncated: boolean; error?: string }>;
    watchStart: (root: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
    watchStop: (root: string) => Promise<{ ok: true } | { ok: false }>;
    onWatchEvent: (cb: (evt: { root: string; event: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'; path: string }) => void) => () => void;
    gitDiff: (root: string, target: string) => Promise<
      | { ok: true; hunks: Array<{ startLine: number; added: number; deleted: number }> }
      | { ok: false; error: string }
    >;
  };
  github: {
    /** Conta GitHub conectada no computador (via git credential). */
    status: () => Promise<{ authenticated: boolean; login?: string }>;
    /** Repos do usuário (próprios, colaborador e de orgs). */
    listRepos: () => Promise<{ ok: true; repos: GithubRepo[] } | { ok: false; error: string }>;
    /** Clona um repo dentro de parentDir/name. */
    clone: (cloneUrl: string, parentDir: string, name: string) =>
      Promise<{ ok: true; path: string } | { ok: false; error: string }>;
    /** Progresso do clone em andamento. Retorna unsubscribe. */
    onCloneProgress: (cb: (p: { phase: string; percent: number }) => void) => () => void;
  };
  git: {
    info: (root: string) => Promise<{ isRepo: boolean; branch: string | null; changes: number; ahead: number; behind: number; hasUpstream: boolean }>;
    /** Atualiza as refs do remoto (origin) sem mexer nos arquivos. */
    fetch: (root: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    branches: (root: string) => Promise<string[]>;
    checkout: (root: string, branch: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    status: (root: string) => Promise<{ isRepo: boolean; branch: string | null; ahead: number; behind: number; files: GitFileStatus[] }>;
    stage: (root: string, paths: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
    unstage: (root: string, paths: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
    commit: (root: string, message: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    diff: (root: string, staged: boolean) => Promise<string>;
    push: (root: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    pull: (root: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    worktreeList: (root: string) => Promise<Array<{ path: string; branch: string | null }>>;
    worktreeAdd: (root: string, name: string) => Promise<{ ok: true; path: string; branch: string } | { ok: false; error: string }>;
    worktreeRemove: (root: string, wtPath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  };
  liveEdit: {
    /** Grava o CSS gerado no projeto (voltz-live-edits.css) e persiste as edições por URL. */
    save: (projectPath: string, url: string, css: string, editMap: unknown) => Promise<{ ok: true; file: string } | { ok: false; error: string }>;
    /** Edições salvas para reaplicar nesta URL (ou null). */
    get: (projectPath: string, url: string) => Promise<Record<string, { styles?: Record<string, string>; text?: string }> | null>;
  };
  browser: {
    clearCache: () => Promise<{ ok: true }>;
    /** Popup de um <webview> do navegador interno → abrir como nova aba.
     *  `sourceId` é o webContentsId do webview que disparou (p/ rotear ao painel certo). */
    onPopup: (cb: (data: { url: string; sourceId: number }) => void) => () => void;
    /** Atividade do agente (MCP) sobre o navegador interno — para o indicador
     *  de transparência no BrowserPane. `webContentsId` identifica a aba tocada. */
    onAgentActivity: (cb: (e: { action: string; webContentsId: number; detail: string | null; ts: number }) => void) => () => void;
    /** Informa ao main o escopo de isolamento por aba: token(terminal)→tabId e
     *  webContentsId(navegador)→tabId. Cada terminal só acessa o navegador da sua aba. */
    setScope: (snapshot: { agents: Record<string, string>; browsers: Record<string, string> }) => Promise<void>;
  };
  devPorts: {
    /** Lista processos servindo em portas TCP locais (inclui órfãos fora do app). */
    scan: () => Promise<DevPortInfo[]>;
    /** Mata a árvore do processo dono da porta. */
    kill: (pid: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  };
  projectMemory: {
    /** Garante CLAUDE.md + AGENTS.md no projeto (não sobrescreve). Retorna os criados. */
    ensure: (projectPath: string, projectName: string) => Promise<{ created: string[] }>;
  };
  app: {
    platform: string;
  };
  system: {
    openInExplorer: (target: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    /** Uso atual de CPU e memória da máquina. */
    metrics: () => Promise<SystemMetrics>;
    /** Otimiza a memória (limpa caches + libera working set no Windows). */
    optimize: () => Promise<{ beforeBytes: number; afterBytes: number; freedBytes: number }>;
  };
  remote: {
    status: () => Promise<RemoteStatusInfo>;
    setToken: (token: string | null) => Promise<{ ok: boolean; botUsername?: string; error?: string }>;
    setEnabled: (on: boolean) => Promise<void>;
    setProjectEnabled: (projectPath: string, on: boolean) => Promise<void>;
    listProjectsEnabled: () => Promise<string[]>;
    generatePairingCode: () => Promise<string>;
    unpair: () => Promise<void>;
    /** Histórico persistente de atividade remota (por projeto). */
    getHistory: () => Promise<RemoteActivity[]>;
    /** Limpa o histórico (tudo, ou só de um projeto pelo basename). */
    clearHistory: (project?: string) => Promise<void>;
    onStatus: (cb: (s: RemoteStatusInfo) => void) => () => void;
    /** Recebe eventos de atividade remota (pedidos, aprovações, respostas). */
    onActivity: (cb: (e: RemoteActivity) => void) => () => void;
  };
  procMonitor: {
    /** Recebe amostras de uso por terminal (~1,5s). Retorna unsubscribe. */
    onSample: (cb: (sample: ProcSample) => void) => () => void;
    /** Força uma amostra imediata de um terminal. */
    sampleNow: (terminalId: string) => Promise<ProcSample | null>;
  };
  shortcuts: {
    onInvoke: (cb: (action: string) => void) => () => void;
  };
}

/** Uso de CPU/memória da árvore de processos de um terminal. */
export interface ProcSample {
  /** = id do PTY / terminalId do painel. */
  terminalId: string;
  /** RSS somado de toda a árvore de processos (bytes). */
  memBytes: number;
  /** CPU% somado da árvore. Pode passar de 100 (multi-core). */
  cpuPercent: number;
  /** Processo vivo E com atividade de CPU recente. */
  active: boolean;
  /** Nº de processos na árvore (shell + filhos). */
  procCount: number;
  /** Epoch ms da amostra. */
  ts: number;
}

/** Processo servindo numa porta TCP local (dev server detectado no PC). */
export interface DevPortInfo {
  pid: number;
  name: string;
  cmd: string;
  ports: number[];
}

/** Estado do controle remoto via Telegram (temporário — será expandido em cluster posterior). */
export interface RemoteStatusInfo {
  running: boolean;
  botUsername: string | null;
  paired: boolean;
  pairingCode: string | null;
  error?: string;
}

/** Evento de atividade do controle remoto, mostrado no app ("assistido"). */
export interface RemoteActivity {
  ts: number;
  kind: 'prompt' | 'approval' | 'approved' | 'denied' | 'response' | 'info';
  project?: string;
  text: string;
}

/** Uso instantâneo de CPU e memória da máquina. */
export interface SystemMetrics {
  /** Uso de CPU do sistema, 0–100 (%). */
  cpu: number;
  mem: {
    /** Bytes em uso. */
    used: number;
    /** Bytes totais. */
    total: number;
    /** Percentual em uso, 0–100. */
    percent: number;
  };
  /** Número de núcleos lógicos. */
  cores: number;
}

declare global {
  interface Window {
    api: IpcApi;
  }
}
