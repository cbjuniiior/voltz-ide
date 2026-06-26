import { LayoutGrid, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProjectCustomStore, selectCustom, DEFAULT_CUSTOM } from '@/stores/projectCustom';
import { getProjectColor } from '@/lib/projectColors';
import { collectLeaves } from '@/lib/layoutTree';

interface TabBarProps {
  onOpenLayoutPicker: () => void;
}

export function TabBar({ onOpenLayoutPicker }: TabBarProps) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const newTab = useWorkspaceStore((s) => s.newTab);
  const customs = useProjectCustomStore((s) => s.customs);

  return (
    <div
      className="flex items-stretch border-b border-border-subtle bg-bg-surface"
      style={{ minHeight: 38 }}
    >
      {/* Tabs */}
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.length === 0 && (
          <div className="flex items-center px-4 text-[11px] text-text-muted">
            Sem abas — abra um projeto na sidebar
          </div>
        )}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const leaves = collectLeaves(tab.root);
          const firstNamed = leaves.find((l) => l.projectPath && l.projectName);

          const custom = firstNamed?.projectPath
            ? selectCustom(customs, firstNamed.projectPath)
            : DEFAULT_CUSTOM;
          const autoColor = firstNamed?.projectName ? getProjectColor(firstNamed.projectName) : null;
          const accentColor = custom.color ?? autoColor?.border ?? 'var(--accent)';
          const tabEmoji = custom.emoji;
          const displayTitle = firstNamed?.projectName ?? tab.title;

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="group relative flex cursor-pointer items-center gap-2 border-r border-border-subtle px-3 text-xs transition-all select-none"
              style={{
                minWidth: 110,
                maxWidth: 220,
                background: isActive ? 'var(--bg-base)' : 'transparent',
              }}
            >
              {/* Active accent bar (top) */}
              {isActive && (
                <span
                  className="absolute inset-x-0 top-0 h-[2px]"
                  style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
                />
              )}

              {tabEmoji ? (
                <span className="text-sm leading-none">{tabEmoji}</span>
              ) : (
                <span
                  className="h-2 w-2 shrink-0 rounded-full transition-opacity"
                  style={{
                    background: accentColor,
                    boxShadow: isActive ? `0 0 6px ${accentColor}` : undefined,
                    opacity: isActive ? 1 : 0.45,
                  }}
                />
              )}

              <span
                className="flex-1 truncate font-medium transition-colors"
                style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                {displayTitle}
              </span>

              {leaves.length > 1 && (
                <span
                  className="rounded px-1 text-[10px] font-medium"
                  style={{
                    background: isActive ? 'var(--bg-active)' : 'var(--bg-hover)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {leaves.length}
                </span>
              )}

              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.id); } }}
                className="shrink-0 rounded p-0.5 transition-colors group-hover:text-text-tertiary hover:!bg-bg-active hover:!text-text-primary"
                style={{ color: isActive ? 'var(--text-muted)' : 'transparent' }}
                aria-label={`Fechar ${displayTitle}`}
              >
                <X size={11} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Right toolbar */}
      <div className="flex shrink-0 items-stretch border-l border-border-subtle">
        <button
          onClick={() => newTab('Novo')}
          className="flex items-center gap-1 px-3 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Nova aba (Ctrl+T)"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={onOpenLayoutPicker}
          className="flex items-center gap-1 px-3 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Novo layout multi-terminal"
        >
          <LayoutGrid size={14} />
        </button>
      </div>
    </div>
  );
}
