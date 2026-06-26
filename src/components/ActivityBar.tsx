import { Home, FolderTree, Server, GitBranch, Sparkles, ListChecks, History, UsersRound, Settings as SettingsIcon, Sun, Moon, Monitor as MonitorIcon } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useDevServersStore } from '@/stores/devServers';
import { useTasksStore, countPendingToday } from '@/stores/tasks';
import { LogoMark } from './Logo';
import { SystemMonitor } from './SystemMonitor';
import type { ThemeMode } from '@shared/types';

export type Activity = 'home' | 'projects' | 'servers' | 'git' | 'skills' | 'tasks' | 'sessions' | 'accounts';

interface Props {
  active: Activity;
  onActivate: (a: Activity) => void;
  onOpenSettings: () => void;
}

export function ActivityBar({ active, onActivate, onOpenSettings }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const devServers = useDevServersStore((s) => s.byPath);
  const runningCount = Object.values(devServers).filter(
    (d) => d.phase === 'running' || d.phase === 'starting' || d.phase === 'installing'
  ).length;
  const pendingTasks = useTasksStore((s) => countPendingToday(s.tasks));

  function cycleTheme() {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(settings.theme);
    void update({ theme: order[(idx + 1) % order.length] });
  }

  return (
    <nav className="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-border-subtle bg-bg-surface py-3">
      {/* Logo */}
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
        style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
          boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
      >
        <LogoMark size={20} color="#fff" />
      </div>

      <Item
        icon={<Home size={18} />}
        label="Dashboard"
        active={active === 'home'}
        onClick={() => onActivate('home')}
      />
      <Item
        icon={<FolderTree size={18} />}
        label="Projetos"
        active={active === 'projects'}
        onClick={() => onActivate('projects')}
      />
      <Item
        icon={<Server size={18} />}
        label="Dev Servers"
        active={active === 'servers'}
        badge={runningCount > 0 ? runningCount : undefined}
        onClick={() => onActivate('servers')}
      />
      <Item
        icon={<GitBranch size={18} />}
        label="Git"
        active={active === 'git'}
        onClick={() => onActivate('git')}
      />
      <Item
        icon={<History size={18} />}
        label="Sessões do Claude"
        active={active === 'sessions'}
        onClick={() => onActivate('sessions')}
      />
      <Item
        icon={<UsersRound size={18} />}
        label="Contas Claude"
        active={active === 'accounts'}
        onClick={() => onActivate('accounts')}
      />
      <Item
        icon={<Sparkles size={18} />}
        label="Skills"
        active={active === 'skills'}
        onClick={() => onActivate('skills')}
      />
      <Item
        icon={<ListChecks size={18} />}
        label="Tarefas"
        active={active === 'tasks'}
        badge={pendingTasks > 0 ? pendingTasks : undefined}
        badgeColor="var(--accent)"
        onClick={() => onActivate('tasks')}
      />

      <div className="flex-1" />

      {/* Monitor de sistema (CPU / RAM) */}
      <SystemMonitor />
      <div className="my-1.5 h-px w-7 bg-border-subtle" />

      <Item
        icon={
          settings.theme === 'light' ? <Sun size={17} /> :
          settings.theme === 'dark'  ? <Moon size={17} /> :
                                        <MonitorIcon size={17} />
        }
        label={`Tema: ${settings.theme}`}
        onClick={cycleTheme}
      />
      <Item
        icon={<SettingsIcon size={17} />}
        label="Configurações (Ctrl+,)"
        onClick={onOpenSettings}
      />
    </nav>
  );
}

function Item({
  icon, label, active, onClick, badge, badgeColor = 'var(--success)',
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-tertiary)';
      }}
    >
      {/* Active indicator bar */}
      {active && (
        <span className="absolute left-0 h-5 w-[3px] rounded-r-full" style={{ background: 'var(--accent)' }} />
      )}
      {icon}
      {typeof badge === 'number' && badge > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
          style={{ background: badgeColor, color: 'var(--accent-fg)' }}
        >
          {badge}
        </span>
      )}
      {/* Tooltip on hover */}
      <span
        className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md border border-border-default bg-bg-overlay px-2 py-1 text-[11px] font-medium text-text-primary opacity-0 shadow-md transition-opacity group-hover:opacity-100"
        style={{ zIndex: 100 }}
      >
        {label}
      </span>
    </button>
  );
}
