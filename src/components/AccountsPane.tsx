import { useEffect, useState } from 'react';
import {
  UsersRound, Plus, Star, Trash2, RefreshCw, Loader2, LogIn, Check, UserRound, X, Pencil,
} from 'lucide-react';
import { useAccountsStore, ACCOUNT_COLORS, type ClaudeAccount } from '@/stores/claudeAccounts';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import { PanelHeader } from './ui';

export function AccountsPane() {
  const rootFolders = useSettingsStore((s) => s.settings.rootFolders);
  const accounts = useAccountsStore((s) => s.accounts);
  const defaultId = useAccountsStore((s) => s.defaultId);
  const identities = useAccountsStore((s) => s.identities);
  const add = useAccountsStore((s) => s.add);
  const remove = useAccountsStore((s) => s.remove);
  const rename = useAccountsStore((s) => s.rename);
  const setColor = useAccountsStore((s) => s.setColor);
  const setDefault = useAccountsStore((s) => s.setDefault);
  const refreshIdentity = useAccountsStore((s) => s.refreshIdentity);
  const refreshAll = useAccountsStore((s) => s.refreshAll);
  const openLoginTerminal = useWorkspaceStore((s) => s.openLoginTerminal);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  // Enquanto houver conta desconectada, refaz a checagem periodicamente
  // (pega o momento em que o login OAuth termina no terminal).
  useEffect(() => {
    const pending = accounts.filter((a) => identities[a.id] && !identities[a.id].connected);
    if (pending.length === 0) return;
    const t = setInterval(() => { pending.forEach((a) => void refreshIdentity(a.id)); }, 4000);
    return () => clearInterval(t);
  }, [accounts, identities, refreshIdentity]);

  async function connect(account: ClaudeAccount) {
    // Abre na pasta de projetos escolhida nas configs (onde o Claude recomenda
    // rodar); cai pro dir da conta se nenhuma pasta raiz estiver configurada.
    const cwd = rootFolders[0] || account.dir;
    openLoginTerminal(account.id, account.label, cwd);
    toast.info('Faça o login', `Abri um terminal para "${account.label}". O Claude vai pedir login — entre com a conta desejada.`);
  }

  async function submitAdd() {
    const name = label.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const account = await add(name);
      setLabel('');
      setAdding(false);
      await connect(account);
    } catch (e) {
      toast.error('Falha ao criar conta', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<UsersRound size={14} />}
        title="Contas Claude"
        subtitle={accounts.length > 1 ? `${accounts.length} contas` : undefined}
        actions={
          <button
            onClick={() => void refreshAll()}
            title="Atualizar"
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <RefreshCw size={13} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-2.5">
        <p className="mb-3 px-1 text-[11px] leading-relaxed text-text-tertiary">
          Conecte várias contas do Claude e escolha qual cada terminal usa. A conta de cada terminal
          aparece no header dele (e ao abrir uma aba).
        </p>

        <div className="space-y-2">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              identity={identities[a.id]}
              isDefault={a.id === defaultId}
              onSetDefault={() => setDefault(a.id)}
              onRename={(label) => rename(a.id, label)}
              onColor={(color) => setColor(a.id, color)}
              onRemove={() => { if (confirm(`Remover a conta "${a.label}"? As credenciais locais dela serão apagadas.`)) void remove(a.id); }}
              onConnect={() => void connect(a)}
              onRefresh={() => void refreshIdentity(a.id)}
            />
          ))}
        </div>

        {adding ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-accent bg-bg-base px-2.5 py-2">
            <UserRound size={13} className="shrink-0 text-text-muted" />
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitAdd(); if (e.key === 'Escape') { setAdding(false); setLabel(''); } }}
              placeholder="Nome (ex.: Max 20x, Trabalho…)"
              className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <button onClick={() => void submitAdd()} disabled={busy || !label.trim()} className="rounded p-1 text-accent disabled:opacity-40" title="Criar e conectar">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button onClick={() => { setAdding(false); setLabel(''); }} className="rounded p-1 text-text-muted hover:text-text-primary" title="Cancelar">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-default px-3 py-2.5 text-[12px] font-medium text-text-tertiary transition-colors hover:border-accent hover:text-accent"
          >
            <Plus size={14} /> Adicionar conta
          </button>
        )}
      </div>
    </div>
  );
}

interface Identity {
  connected: boolean;
  tier: string | null;
  planLabel: string | null;
  email: string | null;
  orgName: string | null;
  expiresAt: number | null;
}

function AccountCard({
  account, identity, isDefault, onSetDefault, onRename, onColor, onRemove, onConnect, onRefresh,
}: {
  account: ClaudeAccount;
  identity: Identity | undefined;
  isDefault: boolean;
  onSetDefault: () => void;
  onRename: (label: string) => void;
  onColor: (color: string) => void;
  onRemove: () => void;
  onConnect: () => void;
  onRefresh: () => void;
}) {
  const connected = identity?.connected;
  const color = account.color ?? (connected ? 'var(--success)' : 'var(--accent)');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label);

  function saveName() {
    const v = draft.trim();
    if (v && v !== account.label) onRename(v);
    setEditing(false);
  }

  return (
    <div className="surface-card p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
        >
          <UserRound size={16} style={{ color }} />
          {/* Status de conexão */}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
            style={{ background: connected ? 'var(--success)' : 'var(--text-disabled)', borderColor: 'var(--bg-surface)' }}
            title={connected ? 'conectada' : 'desconectada'}
          />
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setDraft(account.label); setEditing(false); } }}
              className="w-full rounded bg-bg-base px-1.5 py-0.5 text-[13px] font-semibold text-text-primary outline-none ring-1 ring-accent"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-text-primary">{account.label}</span>
              {account.primary && (
                <span className="rounded px-1 text-[9px] font-bold uppercase tracking-wide text-text-muted" style={{ background: 'var(--bg-active)' }}>principal</span>
              )}
              {identity?.planLabel && (
                <span className="rounded px-1.5 text-[9.5px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{identity.planLabel}</span>
              )}
            </div>
          )}
          <div className="truncate text-[11px] text-text-muted">
            {connected
              ? (identity?.email ?? identity?.orgName ?? 'conectada')
              : <span className="text-warning">não conectada — faça login</span>}
          </div>
        </div>

        {/* Padrão (estrela) */}
        <button
          onClick={onSetDefault}
          title={isDefault ? 'Esta é a conta padrão para novos terminais' : 'Definir como conta padrão'}
          className="shrink-0 rounded p-1.5 transition-colors hover:bg-bg-hover"
          style={{ color: isDefault ? 'var(--warning)' : 'var(--text-muted)' }}
        >
          <Star size={15} fill={isDefault ? 'currentColor' : 'none'} />
        </button>

        {/* Editar (nome + cor) */}
        <button
          onClick={() => { if (editing) saveName(); else { setDraft(account.label); setEditing(true); } }}
          title={editing ? 'Concluir edição' : 'Editar nome e cor'}
          className="shrink-0 rounded p-1.5 transition-colors hover:bg-bg-hover"
          style={{ color: editing ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {editing ? <Check size={15} /> : <Pencil size={14} />}
        </button>
      </div>

      {/* Editor de cor — só no modo edição */}
      {editing && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-base/60 px-2.5 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Cor do ícone</span>
          {ACCOUNT_COLORS.map((c) => {
            const active = (account.color ?? '').toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                onClick={() => onColor(c)}
                title={c}
                className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                style={{ background: c, boxShadow: active ? `0 0 0 2px var(--bg-surface), 0 0 0 3.5px ${c}` : undefined }}
              />
            );
          })}
        </div>
      )}

      {connected && <UsageBars accountId={account.id} />}

      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-default hover:bg-bg-hover"
        >
          <LogIn size={12} /> {connected ? 'Reconectar' : 'Conectar (login)'}
        </button>
        <button
          onClick={onRefresh}
          title="Atualizar status"
          className="rounded-md border border-border-subtle p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <RefreshCw size={12} />
        </button>
        {!account.primary && (
          <button
            onClick={onRemove}
            title="Remover conta"
            className="ml-auto rounded-md border border-border-subtle p-1.5 text-text-muted transition-colors hover:border-danger hover:text-danger"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

interface UWin { key: string; label: string; utilization: number; resetsAt: string | null }

/** "reseta em 36min" / "em 2h" / "em 4d". */
function fmtReset(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `reseta em ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `reseta em ${h}h`;
  return `reseta em ${Math.round(h / 24)}d`;
}

/** Barras de uso (5h, 7 dias, Sonnet) + tempo restante. Lê do cache do store. */
function UsageBars({ accountId }: { accountId: string }) {
  const u = useAccountsStore((s) => s.usage[accountId]);
  const refreshUsage = useAccountsStore((s) => s.refreshUsage);

  useEffect(() => { void refreshUsage(accountId); }, [accountId, refreshUsage]);

  if (!u) return <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-text-muted"><Loader2 size={10} className="animate-spin" /> carregando uso…</div>;
  if (!u.ok) {
    const limited = (u.error ?? '').includes('429');
    return <div className="mt-2.5 text-[10px] text-text-muted">{limited ? 'Limite de consultas atingido — tente em instantes.' : 'Uso indisponível no momento.'}</div>;
  }
  const windows = u.windows.filter((w) => ['five_hour', 'seven_day', 'seven_day_sonnet'].includes(w.key)) as UWin[];
  if (windows.length === 0) return null;

  const labelFor = (k: string) => k === 'five_hour' ? 'Sessão 5h' : k === 'seven_day' ? 'Semana 7d' : 'Semana Sonnet';

  return (
    <div className="mt-3 space-y-2">
      {windows.map((w) => {
        const pct = Math.max(0, Math.min(100, w.utilization));
        const color = w.utilization >= 95 ? 'var(--danger)' : w.utilization >= 80 ? 'var(--warning)' : 'var(--info)';
        const reset = fmtReset(w.resetsAt);
        return (
          <div key={w.key}>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[10.5px] text-text-tertiary">{labelFor(w.key)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-active">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="w-9 shrink-0 text-right text-[10.5px] font-bold tabular-nums" style={{ color }}>{Math.round(w.utilization)}%</span>
            </div>
            {reset && <div className="ml-24 pl-2 text-[9px] text-text-muted">{reset}</div>}
          </div>
        );
      })}
    </div>
  );
}
