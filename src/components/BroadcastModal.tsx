import { useEffect, useMemo, useState } from 'react';
import { X, Radio, Send, Terminal, Check } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { useClaudeStatusStore, type ClaudeStatus } from '@/stores/claudeStatus';
import { collectLeaves } from '@/lib/layoutTree';
import { toast } from '@/stores/toasts';

interface TermTarget {
  paneId: string; terminalId: string; tabId: string; tabTitle: string;
  label: string; status?: ClaudeStatus;
}

const STATUS_META: Record<ClaudeStatus, { label: string; color: string }> = {
  running: { label: 'Trabalhando', color: 'var(--accent)' },
  approval: { label: 'Aprovação', color: 'var(--warning)' },
  waiting: { label: 'Pronto', color: 'var(--success)' },
};

/**
 * Envia o MESMO comando para vários terminais de uma vez (estilo "tmux send-keys
 * a todos"). Complementa o broadcast de digitação contínua (toggleBroadcast da aba):
 * aqui é um disparo único e direcionado — útil pra "git pull", "/clear", "npm test"
 * em N agentes sem digitar em cada um.
 */
export function BroadcastModal({ onClose }: { onClose: () => void }) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const byPane = useClaudeStatusStore((s) => s.byPane);

  const targets = useMemo<TermTarget[]>(() => {
    const out: TermTarget[] = [];
    for (const tab of tabs) {
      for (const lf of collectLeaves(tab.root)) {
        if (!lf.terminalId) continue;
        if (lf.viewMode && lf.viewMode !== 'terminal') continue;
        out.push({
          paneId: lf.id, terminalId: lf.terminalId, tabId: tab.id,
          tabTitle: tab.customTitle || tab.title,
          label: lf.projectName || lf.title || 'terminal',
          status: byPane[lf.id],
        });
      }
    }
    return out;
  }, [tabs, byPane]);

  const [sel, setSel] = useState<Set<string>>(() => new Set(targets.map((t) => t.terminalId)));
  const [cmd, setCmd] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  const setAll = (ids: string[]) => setSel(new Set(ids));

  const selCount = targets.filter((t) => sel.has(t.terminalId)).length;

  function send() {
    const chosen = targets.filter((t) => sel.has(t.terminalId));
    if (!cmd.trim() || chosen.length === 0) return;
    for (const t of chosen) window.api.pty.write(t.terminalId, cmd + '\r');
    toast.success('Comando enviado', `${chosen.length} terminal${chosen.length > 1 ? 'is' : ''}`);
    setCmd('');
    onClose();
  }

  const groups = useMemo(() => {
    const m = new Map<string, { title: string; items: TermTarget[] }>();
    for (const t of targets) {
      const g = m.get(t.tabId) ?? { title: t.tabTitle, items: [] };
      g.items.push(t);
      m.set(t.tabId, g);
    }
    return [...m.values()];
  }, [targets]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-6 pt-[7vh]" onClick={onClose}>
      <div
        className="cmd-enter flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Radio size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-bold text-text-primary">Broadcast de comando</h2>
            <p className="truncate text-[11px] text-text-muted">O mesmo comando, em vários terminais, de uma vez</p>
          </div>
          <button onClick={onClose} title="Fechar (Esc)" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={15} />
          </button>
        </div>

        {/* Comando */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-2.5 transition-colors focus-within:border-accent">
            <Terminal size={13} className="text-text-muted" />
            <input
              autoFocus
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="ex.: git pull, npm test, /clear…"
              className="flex-1 bg-transparent py-2 font-mono text-[12.5px] text-text-primary outline-none placeholder:font-sans placeholder:text-text-muted"
            />
          </div>
          <button
            onClick={send}
            disabled={!cmd.trim() || selCount === 0}
            title="Enviar (Enter)"
            className="flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Send size={14} /> Enviar
          </button>
        </div>

        {/* Seleção rápida */}
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{selCount}/{targets.length} alvos</span>
          <div className="ml-auto flex items-center gap-0.5">
            <QuickBtn onClick={() => setAll(targets.map((t) => t.terminalId))}>Todos</QuickBtn>
            <QuickBtn onClick={() => setAll(targets.filter((t) => t.tabId === activeTabId).map((t) => t.terminalId))}>Aba atual</QuickBtn>
            <QuickBtn onClick={() => setAll(targets.filter((t) => !t.status || t.status === 'waiting').map((t) => t.terminalId))}>Ociosos</QuickBtn>
            <QuickBtn onClick={() => setAll([])}>Nenhum</QuickBtn>
          </div>
        </div>

        {/* Lista de terminais (por aba) */}
        <div className="flex-1 overflow-y-auto p-2">
          {targets.length === 0 && (
            <div className="py-10 text-center text-[12px] text-text-muted">Nenhum terminal aberto.</div>
          )}
          {groups.map((g, gi) => (
            <div key={gi} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">{g.title}</div>
              {g.items.map((t) => {
                const on = sel.has(t.terminalId);
                const sm = t.status ? STATUS_META[t.status] : null;
                return (
                  <button
                    key={t.terminalId}
                    onClick={() => toggle(t.terminalId)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-surface"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border" style={{ background: on ? 'var(--accent)' : 'transparent', borderColor: on ? 'var(--accent)' : 'var(--border-default)' }}>
                      {on && <Check size={11} strokeWidth={3} style={{ color: 'var(--accent-fg)' }} />}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sm?.color ?? 'var(--text-muted)' }} />
                    <span className="flex-1 truncate text-[12.5px]" style={{ color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{t.label}</span>
                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: sm?.color ?? 'var(--text-muted)' }}>{sm?.label ?? 'Ocioso'}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md px-2 py-1 text-[10.5px] font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">
      {children}
    </button>
  );
}
