import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Loader2, Play, MessageSquare } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { getProjectColor } from '@/lib/projectColors';
import { PanelHeader } from './ui';

interface GlobalSession {
  id: string;
  preview: string;
  mtimeMs: number;
  cwd: string | null;
  projectName: string;
}

type BucketKey = 'today' | 'yesterday' | 'week' | 'older';

const BUCKET_LABEL: Record<BucketKey, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Últimos 7 dias',
  older: 'Mais antigas',
};

/** Em qual balde de tempo a sessão cai. */
function bucketOf(mtimeMs: number, now: number): BucketKey {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const t = startOfToday.getTime();
  if (mtimeMs >= t) return 'today';
  if (mtimeMs >= t - 86_400_000) return 'yesterday';
  if (mtimeMs >= t - 7 * 86_400_000) return 'week';
  return 'older';
}

/** "há 3 min", "há 2 h", "ontem 14:32", "12/06 09:10". */
function relTime(mtimeMs: number, now: number): string {
  const diff = now - mtimeMs;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = new Date(mtimeMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${hh}:${mm}`;
}

export function SessionsPane() {
  const openProjectAndResume = useWorkspaceStore((s) => s.openProjectAndResume);
  const [sessions, setSessions] = useState<GlobalSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.api.claude.allSessions(60);
      setSessions(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const groups = useMemo(() => {
    const now = Date.now();
    const map: Record<BucketKey, GlobalSession[]> = { today: [], yesterday: [], week: [], older: [] };
    for (const s of sessions) map[bucketOf(s.mtimeMs, now)].push(s);
    return (['today', 'yesterday', 'week', 'older'] as BucketKey[])
      .map((k) => ({ key: k, items: map[k] }))
      .filter((g) => g.items.length > 0);
  }, [sessions]);

  const now = Date.now();

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<History size={14} />}
        title="Sessões do Claude"
        subtitle={sessions.length > 0 ? `${sessions.length} recentes` : undefined}
        actions={
          <button
            onClick={() => void refresh()}
            title="Atualizar"
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto py-1">
        {loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Loader2 size={20} className="animate-spin text-text-muted" />
            <p className="text-[12px] text-text-tertiary">Lendo histórico…</p>
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <MessageSquare size={22} className="text-text-disabled" />
            <p className="text-[12px] text-text-tertiary">Nenhuma sessão do Claude ainda</p>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.key} className="mb-1.5">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {BUCKET_LABEL[g.key]}
            </div>
            {g.items.map((s) => {
              const color = getProjectColor(s.projectName).border;
              const canResume = !!s.cwd;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (canResume) openProjectAndResume(s.projectName, s.cwd!, s.id);
                  }}
                  disabled={!canResume}
                  title={canResume ? `Retomar em ${s.cwd}` : 'cwd desconhecido'}
                  className="group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-text-secondary">{s.projectName}</span>
                      <span className="shrink-0 text-[10px] text-text-muted">{relTime(s.mtimeMs, now)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-text-tertiary">
                      {s.preview || <span className="italic text-text-muted">sem prévia</span>}
                    </span>
                  </span>
                  {canResume && (
                    <span className="mt-0.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={12} className="text-accent" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {sessions.length > 0 && (
        <div className="border-t border-border-subtle px-3 py-2 text-[10px] text-text-muted">
          Clique numa sessão para retomá-la num novo terminal.
        </div>
      )}
    </div>
  );
}
