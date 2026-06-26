import { create } from 'zustand';

export interface ClaudeAccount {
  id: string;
  label: string;
  /** Diretório CLAUDE_CONFIG_DIR desta conta. */
  dir: string;
  /** A conta principal (~/.claude) — não pode ser removida. */
  primary?: boolean;
  /** Cor do ícone (hex), escolhida pelo usuário. */
  color?: string;
}

/** Paleta para o ícone das contas. */
export const ACCOUNT_COLORS = [
  '#6571ec', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
  '#f59e0b', '#f43f5e', '#ec4899', '#a855f7', '#8b5cf6', '#64748b',
];

export interface AccountIdentity {
  connected: boolean;
  tier: string | null;
  planLabel: string | null;
  email: string | null;
  orgName: string | null;
  expiresAt: number | null;
}

export interface UsageResult {
  ok: boolean;
  windows: Array<{ key: string; label: string; utilization: number; resetsAt: string | null }>;
  extraUsage?: { enabled: boolean; utilization: number | null } | null;
  error?: string;
}

interface PersistShape {
  accounts: ClaudeAccount[];
  defaultId: string;
  usage?: Record<string, UsageResult>;
  usageTs?: Record<string, number>;
}

const PERSIST_KEY = 'claudeAccounts';

interface AccountsStore {
  accounts: ClaudeAccount[];
  defaultId: string;
  loaded: boolean;
  /** Cache de identidade por conta (id → identidade). */
  identities: Record<string, AccountIdentity>;
  /** Cache de uso do plano por conta (com TTL, pra não estourar rate-limit). */
  usage: Record<string, UsageResult>;
  usageTs: Record<string, number>;

  load: () => Promise<void>;
  /** Cria uma conta nova (dir + seed). Retorna a conta (ainda sem login). */
  add: (label: string) => Promise<ClaudeAccount>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, label: string) => void;
  setColor: (id: string, color: string) => void;
  setDefault: (id: string) => void;
  /** Atualiza a identidade (plano/e-mail) de uma conta a partir do disco. */
  refreshIdentity: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  /** Uso do plano com cache (TTL). Só vai à rede se estiver velho. */
  refreshUsage: (id: string, force?: boolean) => Promise<void>;
  /** Dir de config de uma conta (cai pra principal se não achar). */
  dirFor: (accountId: string | undefined) => string;
  /**
   * CLAUDE_CONFIG_DIR a exportar no terminal: VAZIO para a conta principal.
   * Setar ~/.claude explicitamente faria o claude procurar ~/.claude/.claude.json
   * (vazio) em vez do config real em ~/.claude.json — por isso a principal usa o
   * default nativo do claude (sem env). Secundárias usam o próprio dir.
   */
  envConfigDirFor: (accountId: string | undefined) => string;
  /** Conta resolvida (cai pra padrão). */
  accountFor: (accountId: string | undefined) => ClaudeAccount | null;
}

function persist(_ignore?: unknown) {
  void _ignore;
  const { accounts, defaultId, usage, usageTs } = useAccountsStore.getState();
  // Só persiste resultados bons de uso (não cacheia erro/429).
  const okUsage: Record<string, UsageResult> = {};
  const okTs: Record<string, number> = {};
  for (const [id, u] of Object.entries(usage)) {
    if (u?.ok) { okUsage[id] = u; okTs[id] = usageTs[id]; }
  }
  void window.api.store.set(PERSIST_KEY, { accounts, defaultId, usage: okUsage, usageTs: okTs } satisfies PersistShape);
}

function newId(): string {
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Ids com fetch de uso em andamento (evita corrida entre componentes). */
const usageInFlight = new Set<string>();

export const useAccountsStore = create<AccountsStore>((set, get) => ({
  accounts: [],
  defaultId: 'primary',
  loaded: false,
  identities: {},
  usage: {},
  usageTs: {},

  async load() {
    const stored = await window.api.store.get<PersistShape>(PERSIST_KEY);
    const primaryDir = await window.api.accounts.defaultDir();
    let accounts = stored?.accounts ?? [];
    // Garante a conta principal apontando para ~/.claude.
    if (!accounts.some((a) => a.primary)) {
      accounts = [{ id: 'primary', label: 'Conta principal', dir: primaryDir, primary: true }, ...accounts];
    } else {
      // Mantém o dir da principal sempre atualizado.
      accounts = accounts.map((a) => (a.primary ? { ...a, dir: primaryDir } : a));
    }
    const defaultId = stored?.defaultId && accounts.some((a) => a.id === stored.defaultId)
      ? stored.defaultId
      : (accounts.find((a) => a.primary)?.id ?? accounts[0]?.id ?? 'primary');
    set({ accounts, defaultId, loaded: true, usage: stored?.usage ?? {}, usageTs: stored?.usageTs ?? {} });
    void get().refreshAll();
  },

  async add(label) {
    const id = newId();
    const dir = await window.api.accounts.createDir(id);
    const account: ClaudeAccount = { id, label: label.trim() || 'Nova conta', dir };
    const accounts = [...get().accounts, account];
    set({ accounts });
    persist({ accounts, defaultId: get().defaultId });
    return account;
  },

  async remove(id) {
    const acc = get().accounts.find((a) => a.id === id);
    if (!acc || acc.primary) return;
    await window.api.accounts.removeDir(acc.dir);
    const accounts = get().accounts.filter((a) => a.id !== id);
    let defaultId = get().defaultId;
    if (defaultId === id) defaultId = accounts.find((a) => a.primary)?.id ?? accounts[0]?.id ?? 'primary';
    const identities = { ...get().identities };
    delete identities[id];
    set({ accounts, defaultId, identities });
    persist({ accounts, defaultId });
  },

  rename(id, label) {
    const accounts = get().accounts.map((a) => (a.id === id ? { ...a, label: label.trim() || a.label } : a));
    set({ accounts });
    persist({ accounts, defaultId: get().defaultId });
  },

  setColor(id, color) {
    const accounts = get().accounts.map((a) => (a.id === id ? { ...a, color } : a));
    set({ accounts });
    persist({ accounts, defaultId: get().defaultId });
  },

  setDefault(id) {
    if (!get().accounts.some((a) => a.id === id)) return;
    set({ defaultId: id });
    persist({ accounts: get().accounts, defaultId: id });
  },

  async refreshIdentity(id) {
    const acc = get().accounts.find((a) => a.id === id);
    if (!acc) return;
    const ident = await window.api.accounts.identity(acc.dir);
    set((s) => ({ identities: { ...s.identities, [id]: ident } }));
  },

  async refreshAll() {
    await Promise.all(get().accounts.map((a) => get().refreshIdentity(a.id)));
  },

  async refreshUsage(id, force) {
    const acc = get().accounts.find((a) => a.id === id);
    if (!acc) return;
    const TTL = 240_000; // 4 min — endpoint tem rate-limit rígido (429)
    const have = get().usage[id];
    const fresh = Date.now() - (get().usageTs[id] ?? 0) < TTL && have?.ok;
    if ((fresh && !force) || usageInFlight.has(id)) return;
    usageInFlight.add(id);
    try {
      const u = await window.api.claude.usage(acc.dir);
      set((s) => ({
        // Em erro/429, mantém o último dado bom (não apaga as barras).
        usage: { ...s.usage, [id]: u.ok || !s.usage[id] ? u : s.usage[id] },
        usageTs: { ...s.usageTs, [id]: Date.now() },
      }));
      if (u.ok) persist();
    } finally {
      usageInFlight.delete(id);
    }
  },

  dirFor(accountId) {
    const acc = get().accountFor(accountId);
    return acc?.dir ?? '';
  },

  envConfigDirFor(accountId) {
    const acc = get().accountFor(accountId);
    if (!acc || acc.primary) return '';
    return acc.dir;
  },

  accountFor(accountId) {
    const { accounts, defaultId } = get();
    return accounts.find((a) => a.id === accountId)
      ?? accounts.find((a) => a.id === defaultId)
      ?? accounts.find((a) => a.primary)
      ?? null;
  },
}));
