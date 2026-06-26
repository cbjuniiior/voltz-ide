import { TerminalSquare, Loader2, Search } from 'lucide-react';
import type { ClaudeStatus } from '@/stores/claudeStatus';

export interface SwitchItem {
  tabId: string;
  paneId: string;
  title: string;
  project: string | null;
  status?: ClaudeStatus;
}

/** Switcher rápido de terminais (Ctrl+Tab). Visual puro — a navegação/seleção
 *  é controlada pelo App (segura Ctrl, Tab cicla, digita p/ filtrar, soltar Ctrl
 *  seleciona). */
export function TerminalSwitcher({ items, activeIdx, query = '', onPick }: {
  items: SwitchItem[];
  activeIdx: number;
  query?: string;
  onPick: (i: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-sm">
      <div className="w-[min(460px,90vw)] overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <Search size={12} className="shrink-0 text-text-muted" />
          {query
            ? <span className="flex-1 truncate font-mono text-[12px] text-text-primary">{query}<span className="ml-px animate-pulse text-accent">▋</span></span>
            : <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Terminais — digite p/ filtrar</span>}
          <span className="shrink-0 font-mono text-[9.5px] text-text-disabled">Ctrl+Tab · Enter</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-text-muted">Nenhum terminal corresponde.</div>
          )}
          {items.map((it, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={it.tabId + it.paneId}
                onMouseEnter={() => onPick(i)}
                onClick={() => onPick(i)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{ background: active ? 'var(--bg-hover)' : 'transparent' }}
              >
                <TerminalSquare size={14} className="shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{it.title}</span>
                  {it.project && <span className="block truncate text-[10.5px] text-text-muted">{it.project}</span>}
                </span>
                {it.status === 'running' && <Loader2 size={12} className="shrink-0 animate-spin text-text-muted" />}
                {it.status === 'approval' && <span className="claude-dot h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--warning)', boxShadow: '0 0 6px var(--warning)' }} />}
                {it.status === 'waiting' && <span className="claude-dot h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
