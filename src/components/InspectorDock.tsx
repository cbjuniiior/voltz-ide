import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, GitBranch, Server, ListChecks, History,
  RefreshCw, Loader2, Plus, Check, Play, Folder,
} from 'lucide-react';
import { useGitStore, selectGit } from '@/stores/git';
import { useTasksStore, todayKey } from '@/stores/tasks';
import { useWorkspaceStore } from '@/stores/workspace';
import { DevServerControl } from './DevServerControl';
import { getProjectColor } from '@/lib/projectColors';

interface Props {
  projectPath: string | null;
  projectName: string | null;
  accent: string;
}

interface SessionRow { id: string; preview: string; mtimeMs: number }

export function InspectorDock({ projectPath, projectName, accent }: Props) {
  if (!projectPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Folder size={22} className="text-text-disabled" />
        <p className="text-[12px] text-text-tertiary">Abra um projeto numa aba para ver o contexto aqui.</p>
      </div>
    );
  }
  return <InspectorBody projectPath={projectPath} projectName={projectName} accent={accent} />;
}

function InspectorBody({ projectPath, projectName, accent }: { projectPath: string; projectName: string | null; accent: string }) {
  const git = useGitStore((s) => selectGit(s.byPath, projectPath));
  const refreshGit = useGitStore((s) => s.refresh);

  useEffect(() => { void refreshGit(projectPath); }, [projectPath, refreshGit]);

  const name = projectName ?? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath;

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho do projeto */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-text-primary" title={projectPath}>
          {name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Git */}
        <Section icon={<GitBranch size={13} />} title="Git" defaultOpen>
          {git?.isRepo ? (
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="flex items-center gap-1.5 rounded-md bg-bg-active px-2 py-1 text-[11px] font-medium text-text-secondary">
                <GitBranch size={11} className="text-text-muted" />
                {git.branch ?? '—'}
              </span>
              <span
                className="rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: git.changes > 0 ? 'var(--warning-soft)' : 'var(--bg-active)',
                  color: git.changes > 0 ? 'var(--warning)' : 'var(--text-muted)',
                }}
              >
                {git.changes > 0 ? `${git.changes} alteração(ões)` : 'limpo'}
              </span>
              <button
                onClick={() => void refreshGit(projectPath)}
                title="Atualizar"
                className="ml-auto rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          ) : (
            <p className="px-1 py-1.5 text-[11px] text-text-muted">Não é um repositório git.</p>
          )}
        </Section>

        {/* Dev server */}
        <Section icon={<Server size={13} />} title="Dev server" defaultOpen>
          <div className="px-1 py-1">
            <DevServerControl projectPath={projectPath} variant="header" accent={accent} />
          </div>
        </Section>

        {/* Tarefas do projeto */}
        <Section icon={<ListChecks size={13} />} title="Tarefas do projeto" defaultOpen>
          <ProjectTasks projectPath={projectPath} projectName={name} accent={accent} />
        </Section>

        {/* Sessões do Claude */}
        <Section icon={<History size={13} />} title="Sessões do Claude" defaultOpen>
          <ProjectSessions projectPath={projectPath} projectName={name} />
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon, title, defaultOpen, children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
      >
        {open ? <ChevronDown size={12} className="text-text-muted" /> : <ChevronRight size={12} className="text-text-muted" />}
        <span className="text-text-muted">{icon}</span>
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</span>
      </button>
      {open && <div className="px-2 pb-2.5">{children}</div>}
    </div>
  );
}

function ProjectTasks({ projectPath, projectName, accent }: { projectPath: string; projectName: string; accent: string }) {
  const tasks = useTasksStore((s) => s.tasks);
  const toggle = useTasksStore((s) => s.toggle);
  const add = useTasksStore((s) => s.add);
  const [text, setText] = useState('');

  const list = useMemo(
    () => tasks
      .filter((t) => t.projectPath === projectPath && !t.done)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.priority ?? 5) - (b.priority ?? 5)))
      .slice(0, 8),
    [tasks, projectPath],
  );

  function submit() {
    const v = text.trim();
    if (!v) return;
    add(v, todayKey(), { name: projectName, path: projectPath });
    setText('');
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 transition-colors focus-within:border-accent">
        <Plus size={12} className="shrink-0 text-text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Nova tarefa pra hoje…"
          className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
      {list.length === 0 ? (
        <p className="px-1 pt-1 text-[11px] text-text-muted">Nenhuma tarefa pendente.</p>
      ) : (
        list.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-bg-hover"
          >
            <span
              className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border transition-colors"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <Check size={11} className="text-text-disabled group-hover:text-accent" style={{ color: accent }} />
            </span>
            <span className="flex-1 truncate text-[12px] text-text-secondary">{t.text}</span>
            {t.date < todayKey() && (
              <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>!</span>
            )}
          </button>
        ))
      )}
    </div>
  );
}

function ProjectSessions({ projectPath, projectName }: { projectPath: string; projectName: string }) {
  const openProjectAndResume = useWorkspaceStore((s) => s.openProjectAndResume);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.api.claude.sessions(projectPath);
      setSessions(list.slice(0, 6));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { void load(); }, [load]);

  if (loading && sessions.length === 0) {
    return <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-text-muted"><Loader2 size={11} className="animate-spin" /> lendo…</div>;
  }
  if (sessions.length === 0) {
    return <p className="px-1 py-1 text-[11px] text-text-muted">Nenhuma sessão ainda.</p>;
  }

  return (
    <div className="space-y-0.5">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => openProjectAndResume(projectName, projectPath, s.id)}
          title="Retomar esta sessão num novo terminal"
          className="group flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-bg-hover"
        >
          <Play size={11} className="mt-0.5 shrink-0 text-text-muted group-hover:text-accent" />
          <span className="line-clamp-2 flex-1 text-[11px] leading-snug text-text-tertiary">
            {s.preview || <span className="italic text-text-muted">sem prévia</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
