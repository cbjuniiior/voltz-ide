import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Search, Sparkles, Plus, Check, X,
  FolderOpen, BadgeCheck, Globe, Loader2, Copy, ExternalLink, Trash2, Users,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { collectLeaves } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';
import {
  SKILLS, SKILL_CATEGORIES, type SkillCatalogEntry, type SkillCategory,
} from '@/lib/skillsCatalog';
import { GLOBAL_SKILL_GROUPS, type GlobalSkillEntry } from '@/lib/globalSkillsCatalog';
import { useGlobalSkillsStore } from '@/stores/globalSkills';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { toast } from '@/stores/toasts';

interface OpenProject {
  path: string;
  name: string;
}

function useOpenProjects(): OpenProject[] {
  // Subscribe to a STABLE reference (tabs array) and derive in useMemo.
  // Returning a new array directly inside the selector would cause an infinite
  // re-render loop because Zustand compares selector results with Object.is.
  const tabs = useWorkspaceStore((s) => s.tabs);
  return useMemo(() => {
    const seen = new Map<string, OpenProject>();
    for (const tab of tabs) {
      for (const leaf of collectLeaves(tab.root)) {
        if (leaf.projectPath && !seen.has(leaf.projectPath)) {
          seen.set(leaf.projectPath, {
            path: leaf.projectPath,
            name: leaf.projectName ?? leaf.projectPath,
          });
        }
      }
    }
    return Array.from(seen.values());
  }, [tabs]);
}

export function SkillsPane() {
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SkillCategory | 'all'>('all');
  const [pickerSkill, setPickerSkill] = useState<SkillCatalogEntry | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  // Map<projectPath, Set<installedSkillId>>
  const [installed, setInstalled] = useState<Map<string, Set<string>>>(new Map());
  const openProjects = useOpenProjects();

  // Refresh installed-state for every currently-open project whenever the set changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<string, Set<string>>();
      await Promise.all(openProjects.map(async (p) => {
        const ids = await window.api.skills.listInstalled(p.path);
        next.set(p.path, new Set(ids));
      }));
      if (!cancelled) setInstalled(next);
    })();
    return () => { cancelled = true; };
  }, [openProjects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SKILLS.filter((s) => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q)
        || s.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [query, activeCategory]);

  function installedCount(skillId: string): number {
    let n = 0;
    for (const set of installed.values()) if (set.has(skillId)) n += 1;
    return n;
  }

  async function handleInstall(project: OpenProject, skill: SkillCatalogEntry) {
    const result = await window.api.skills.install(project.path, skill.id, skill.body);
    if (result.ok) {
      toast.success('Skill instalada', `${skill.name} → ${project.name}`);
      setInstalled((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(project.path) ?? []);
        set.add(skill.id);
        next.set(project.path, set);
        return next;
      });
    } else {
      toast.error('Falha ao instalar', result.error);
    }
    setPickerSkill(null);
    setPickerAnchor(null);
  }

  async function handleUninstall(project: OpenProject, skill: SkillCatalogEntry) {
    const result = await window.api.skills.uninstall(project.path, skill.id);
    if (result.ok) {
      toast.info('Skill removida', `${skill.name} ← ${project.name}`);
      setInstalled((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(project.path) ?? []);
        set.delete(skill.id);
        next.set(project.path, set);
        return next;
      });
    } else {
      toast.error('Falha ao remover', result.error);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3.5">
        <Sparkles size={14} className="text-accent" />
        <h2 className="flex-1 text-[14px] font-semibold tracking-tight text-text-primary">Skills</h2>
        <span className="text-[10px] text-text-muted">
          {scope === 'project' ? `${SKILLS.length} curadas` : 'todas as contas'}
        </span>
      </div>

      {/* Toggle de escopo */}
      <div className="mx-2 mb-2 flex gap-1 rounded-lg border border-border-subtle bg-bg-base/60 p-0.5">
        <ScopeTab
          icon={<FolderOpen size={12} />}
          label="Por projeto"
          active={scope === 'project'}
          onClick={() => setScope('project')}
        />
        <ScopeTab
          icon={<Globe size={12} />}
          label="Globais"
          active={scope === 'global'}
          onClick={() => setScope('global')}
        />
      </div>

      {scope === 'global' && <GlobalSkillsView />}

      {scope === 'project' && (<>
      {/* Search */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 transition-colors focus-within:border-accent">
          <Search size={12} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar skill…"
            className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-text-muted hover:text-text-primary" aria-label="Limpar">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1 px-2 pb-2">
        <CategoryChip
          label="Todas"
          emoji="✦"
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        />
        {SKILL_CATEGORIES.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.label}
            emoji={c.emoji}
            active={activeCategory === c.id}
            onClick={() => setActiveCategory(c.id)}
          />
        ))}
      </div>

      {/* Helper line about open projects */}
      <div className="mx-2 mb-1.5 rounded-lg border border-border-subtle bg-bg-base/50 px-2.5 py-1.5 text-[10.5px] text-text-muted">
        {openProjects.length === 0
          ? <>Abra um projeto numa aba pra poder instalar skills.</>
          : <>Você tem <span className="font-semibold text-text-secondary">{openProjects.length}</span> projeto(s) aberto(s). Clique em <span className="text-accent">+ Adicionar</span> pra escolher onde instalar.</>}
      </div>

      {/* Skill list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px] text-text-muted">
            Nenhuma skill encontrada.
          </div>
        )}
        {filtered.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            installedCount={installedCount(skill.id)}
            canInstall={openProjects.length > 0}
            onAddClick={(anchor) => {
              setPickerSkill(skill);
              setPickerAnchor(anchor);
            }}
          />
        ))}
      </div>

      {pickerSkill && pickerAnchor && (
        <ProjectPickerPopover
          skill={pickerSkill}
          anchor={pickerAnchor}
          projects={openProjects}
          installedMap={installed}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          onClose={() => { setPickerSkill(null); setPickerAnchor(null); }}
        />
      )}
      </>)}
    </div>
  );
}

// ===== Toggle de escopo (projeto / global) =====
function ScopeTab({
  icon, label, active, onClick,
}: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ===== View de skills globais (todas as contas) =====
function GlobalSkillsView() {
  const accounts = useAccountsStore((s) => s.accounts);
  const accountsLoaded = useAccountsStore((s) => s.loaded);
  const loadAccounts = useAccountsStore((s) => s.load);
  const loaded = useGlobalSkillsStore((s) => s.loaded);
  const load = useGlobalSkillsStore((s) => s.load);
  const installedMap = useGlobalSkillsStore((s) => s.installed);
  const busyMap = useGlobalSkillsStore((s) => s.busy);
  const install = useGlobalSkillsStore((s) => s.install);
  const uninstall = useGlobalSkillsStore((s) => s.uninstall);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => { if (!accountsLoaded) void loadAccounts(); }, [accountsLoaded, loadAccounts]);

  const dirs = useMemo(() => accounts.map((a) => a.dir).filter(Boolean), [accounts]);
  const accountCount = dirs.length;

  async function onInstall(entry: GlobalSkillEntry) {
    const res = await install(entry, dirs);
    if (res.ok) {
      const extra = res.count && res.count > 1 ? ` · ${res.count} skills` : '';
      toast.success('Skill global instalada', `${entry.name} → ${res.accounts} conta(s)${extra}`);
    } else {
      toast.error('Falha ao instalar', res.error);
    }
  }
  async function onUninstall(entry: GlobalSkillEntry) {
    const res = await uninstall(entry, dirs);
    if (res.ok) toast.info('Skill global removida', entry.name);
    else toast.error('Falha ao remover', res.error);
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/50 px-2.5 py-1.5 text-[10.5px] text-text-muted">
        <Users size={12} className="text-accent" />
        {accountCount === 0
          ? <>Nenhuma conta carregada ainda.</>
          : <>Instala em <span className="font-semibold text-text-secondary">{accountCount}</span> conta(s). Contas novas herdam automaticamente.</>}
      </div>

      {GLOBAL_SKILL_GROUPS.map((group) => (
        <div key={group.id} className="mb-3">
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <span>{group.emoji}</span>
            <span className="text-[11.5px] font-semibold text-text-secondary">{group.label}</span>
          </div>
          <p className="mb-2 px-1 text-[10px] leading-snug text-text-muted">{group.blurb}</p>
          {group.skills.map((skill) =>
            skill.kind === 'copy' ? (
              <GlobalSkillCard
                key={skill.id}
                skill={skill}
                installed={!!installedMap[skill.id]}
                busy={!!busyMap[skill.id]}
                canInstall={accountCount > 0}
                onInstall={() => onInstall(skill)}
                onUninstall={() => onUninstall(skill)}
              />
            ) : (
              <PluginSkillCard key={skill.id} skill={skill} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function openRepo(url: string) {
  void window.api.devServer.openUrl(url);
}

// ===== Card de skill global instalável (copy) =====
function GlobalSkillCard({
  skill, installed, busy, canInstall, onInstall, onUninstall,
}: {
  skill: GlobalSkillEntry;
  installed: boolean;
  busy: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="mb-2 rounded-xl border border-border-subtle bg-bg-base/40 px-3 py-2.5 transition-colors hover:border-border-default">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: 'var(--bg-active)' }}>
          {skill.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-text-primary">{skill.name}</span>
            {skill.multi && (
              <span className="shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider" style={{ background: 'var(--bg-active)', color: 'var(--text-tertiary)' }}>
                pacote
              </span>
            )}
            {installed && (
              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                <Check size={9} /> instalada
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-tertiary">{skill.description}</p>
          <button
            onClick={() => openRepo(skill.repoUrl)}
            className="mt-1 flex items-center gap-1 text-[9.5px] text-text-muted hover:text-accent"
          >
            <ExternalLink size={9} /> repositório · {skill.license}
          </button>
        </div>
      </div>
      {installed ? (
        <button
          onClick={onUninstall}
          disabled={busy}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {busy ? 'Removendo…' : 'Remover de todas as contas'}
        </button>
      ) : (
        <button
          onClick={onInstall}
          disabled={busy || !canInstall}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
          {busy ? 'Instalando…' : 'Instalar em todas as contas'}
        </button>
      )}
    </div>
  );
}

// ===== Card de plugin/MCP (não copiável — mostra o comando) =====
function PluginSkillCard({ skill }: { skill: GlobalSkillEntry }) {
  const [copied, setCopied] = useState(false);
  const cmd = skill.install?.command ?? '';
  function copy() {
    void window.api.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.info('Comando copiado', 'Cole no terminal da conta desejada.');
  }
  return (
    <div className="mb-2 rounded-xl border border-border-subtle bg-bg-base/40 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: 'var(--bg-active)' }}>
          {skill.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-text-primary">{skill.name}</span>
            <span className="shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider" style={{ background: 'var(--warning-soft, var(--bg-active))', color: 'var(--warning, var(--text-tertiary))' }}>
              terminal
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-tertiary">{skill.description}</p>
        </div>
      </div>
      {skill.install && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] text-text-muted">{skill.install.note}</div>
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5" style={{ background: 'var(--bg-active)' }}>
            <code className="min-w-0 flex-1 truncate text-[10.5px] text-text-secondary">{cmd}</code>
            <button onClick={copy} className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary" title="Copiar comando">
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => openRepo(skill.repoUrl)}
        className="mt-1.5 flex items-center gap-1 text-[9.5px] text-text-muted hover:text-accent"
      >
        <ExternalLink size={9} /> repositório · {skill.license}
      </button>
    </div>
  );
}

// ===== Category chip =====
function CategoryChip({
  label, emoji, active, onClick,
}: { label: string; emoji: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'var(--bg-base)',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
        border: `1px solid ${active ? 'var(--accent-strong)' : 'var(--border-subtle)'}`,
      }}
    >
      <span style={{ filter: active ? 'none' : 'grayscale(0.3)', opacity: active ? 1 : 0.8 }}>
        {emoji}
      </span>
      {label}
    </button>
  );
}

// ===== Skill card =====
function SkillCard({
  skill, installedCount, canInstall, onAddClick,
}: {
  skill: SkillCatalogEntry;
  installedCount: number;
  canInstall: boolean;
  onAddClick: (anchor: HTMLElement) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const category = SKILL_CATEGORIES.find((c) => c.id === skill.category);
  return (
    <div className="group mb-2 rounded-xl border border-border-subtle bg-bg-base/40 px-3 py-2.5 transition-colors hover:border-border-default">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{ background: 'var(--bg-active)' }}
        >
          {skill.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-text-primary">{skill.name}</span>
            {skill.source === 'anthropic' && (
              <span
                title="Skill oficial Anthropic"
                className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <BadgeCheck size={9} />
                oficial
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-tertiary">{skill.description}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {category && (
              <span className="text-[10px] text-text-muted">
                {category.emoji} {category.label}
              </span>
            )}
            {installedCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                <Check size={9} />
                {installedCount} projeto{installedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); if (btnRef.current) onAddClick(btnRef.current); }}
        disabled={!canInstall}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        onMouseEnter={(e) => { if (canInstall) e.currentTarget.style.background = 'var(--accent-strong)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
      >
        <Plus size={12} />
        Adicionar a projeto
      </button>
    </div>
  );
}

// ===== Project picker popover =====
function ProjectPickerPopover({
  skill, anchor, projects, installedMap, onInstall, onUninstall, onClose,
}: {
  skill: SkillCatalogEntry;
  anchor: HTMLElement;
  projects: OpenProject[];
  installedMap: Map<string, Set<string>>;
  onInstall: (project: OpenProject, skill: SkillCatalogEntry) => void;
  onUninstall: (project: OpenProject, skill: SkillCatalogEntry) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const customs = useProjectCustomStore((s) => s.customs);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const winW = window.innerWidth;
    const popW = 280;
    let left = r.right + 8;
    if (left + popW > winW) left = r.left - popW - 8;
    if (left < 8) left = 8;
    setPos({ top: r.top, left });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[200] flex flex-col rounded-xl border border-border-default bg-bg-overlay shadow-lg"
      style={{ top: pos.top, left: pos.left, width: 280, maxHeight: 360 }}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <span className="text-lg">{skill.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text-primary">{skill.name}</div>
          <div className="text-[10px] text-text-muted">Instalar em qual projeto?</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          <X size={11} />
        </button>
      </div>
      <div className="overflow-y-auto py-1">
        {projects.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-text-muted">
            Nenhum projeto aberto.
          </div>
        )}
        {projects.map((p) => {
          const isInstalled = installedMap.get(p.path)?.has(skill.id) ?? false;
          const custom = selectCustom(customs, p.path);
          const auto = getProjectColor(custom.alias || p.name);
          const accent = custom.color ?? auto.border;
          const displayName = custom.alias || p.name;
          return (
            <div
              key={p.path}
              className="group/row flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-bg-hover"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px]"
                style={{
                  background: (custom.color ?? auto.badge) + '2e',
                  border: `1px solid ${accent}40`,
                }}
              >
                {custom.emoji ?? <FolderOpen size={11} style={{ color: accent }} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-medium text-text-secondary" title={p.path}>
                  {displayName}
                </div>
                <div className="truncate text-[9.5px] text-text-muted" title={p.path}>
                  {p.path}
                </div>
              </div>
              {isInstalled ? (
                <button
                  onClick={() => onUninstall(p, skill)}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                  title="Remover skill"
                >
                  <Check size={11} />
                  <span className="hidden group-hover/row:hidden">Instalada</span>
                  <span className="hidden group-hover/row:inline">Remover</span>
                </button>
              ) : (
                <button
                  onClick={() => onInstall(p, skill)}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  title="Instalar skill"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
                >
                  <Plus size={11} />
                  Adicionar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-border-subtle px-3 py-1.5 text-[9.5px] text-text-muted">
        Instala em <code className="rounded bg-bg-active px-1 py-px">.claude/skills/{skill.id}/</code>
      </div>
    </div>
  );
}
