import { useState, useRef, useEffect } from 'react';
import {
  Folder, History, Mic, MicOff, RotateCcw,
  X, MoreHorizontal, Star, Pencil,
  Palette, Check, ChevronRight, RotateCcw as ResetIcon,
  PanelTop, PanelBottom, PanelLeft, PanelRight,
  TerminalSquare, Globe, Columns2, Rows2, SplitSquareHorizontal,
  Loader2, Cpu, Gauge, Sparkles, UserRound, FolderTree, Smartphone,
} from 'lucide-react';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { useClaudeStatusStore, type ClaudeStatus } from '@/stores/claudeStatus';
import type { PaneLeaf } from '@shared/types';
import type { SplitPosition } from '@/lib/layoutTree';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSettingsStore } from '@/stores/settings';
import { useProjectCustomStore, selectCustom, DEFAULT_CUSTOM } from '@/stores/projectCustom';
import { useProvidersStore } from '@/stores/providers';
import { useProcMonitorStore } from '@/stores/procMonitor';
import { useRemoteStore } from '@/stores/remote';
import { getProjectColor } from '@/lib/projectColors';
import { TitleColorPopover } from './TitleColorPopover';
import { TERMINAL_THEMES, TERMINAL_THEME_GROUPS } from '@/lib/terminalThemes';
import { DevServerControl } from './DevServerControl';
import { ProjectEditPopover } from './ProjectEditPopover';
import { GitChip } from './GitChip';
import { PaneMetrics } from './PaneMetrics';

/** Caminho curto: ~ no home + últimas partes. */
function shortPath(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length <= 3) return norm;
  return '…/' + parts.slice(-3).join('/');
}

interface Props {
  tabId: string;
  pane: PaneLeaf;
  onStartClaude: () => void;
  onResumeClaude: () => void;
  onResumeSession: (sessionId: string, configDir?: string) => void;
  onToggleSpeech: () => void;
  onClearTerminal: () => void;
  hasTerminal: boolean;
  claudeRunning?: boolean;
  claudeModel?: string | null;
  accountId?: string;
  onSetAccount?: (accountId: string) => void;
  recording?: boolean;
  viewMode: 'terminal' | 'browser';
  onOpenBrowser: () => void;
  /** Torna a identidade do painel uma "alça" de arraste (reordenar painéis). */
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
}

export function PaneHeader({
  tabId, pane, onStartClaude, onResumeClaude, onResumeSession, onToggleSpeech, onClearTerminal,
  hasTerminal, claudeRunning, claudeModel, accountId, onSetAccount, recording, viewMode, onOpenBrowser,
  dragHandleProps,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const editAnchorRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLSpanElement>(null);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const splitPaneWith = useWorkspaceStore((s) => s.splitPaneWith);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const updatePane = useWorkspaceStore((s) => s.updatePane);
  const toggleTreeFor = useWorkspaceStore((s) => s.toggleTreeFor);
  const treeHidden = useWorkspaceStore((s) => s.treeHidden);
  const treeProjectPath = useWorkspaceStore((s) => s.treeProject?.path ?? null);
  const treeActive = !treeHidden && !!pane.projectPath && treeProjectPath === pane.projectPath;
  const activeSkill = useClaudeStatusStore((s) => s.skillByPane[pane.id]);
  const liveStatus = useClaudeStatusStore((s) => s.byPane[pane.id]);
  const aiProviders = useProvidersStore((s) => s.providers);
  const procActive = useProcMonitorStore((s) => (pane.terminalId ? s.byTerminal[pane.terminalId]?.active ?? false : false));

  // Largura do header → colapsa elementos quando o painel fica estreito (sem cortar).
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerW, setHeaderW] = useState(900);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderW(el.clientWidth));
    ro.observe(el);
    setHeaderW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const compact = headerW < 640; // esconde caminho, contas e o rótulo "Rodar"
  const narrow = headerW < 470;  // providers viram só o ponto colorido; ícones 2ºs vão pro menu
  const tiny = headerW < 360;    // some também o stepper de fonte (resta árvore/sessões/⋯)

  /** Roda o agente do provider NESTE terminal (Claude usa o fluxo dedicado). */
  function runProvider(p: { command: string }) {
    if (p.command.trim() === 'claude') { onStartClaude(); return; }
    // Codex/Gemini/etc.: garante a memória do projeto (AGENTS.md + CLAUDE.md).
    if (pane.projectPath) void window.api.projectMemory.ensure(pane.projectPath, pane.projectName ?? '').catch(() => {});
    if (pane.terminalId) window.api.pty.write(pane.terminalId, `${p.command}\r`);
  }

  function splitWith(orientation: 'horizontal' | 'vertical', mode: 'terminal' | 'browser') {
    splitPaneWith(tabId, pane.id, orientation, 'after', mode);
    setSplitOpen(false);
  }
  const toggleFavorite = useProjectCustomStore((s) => s.toggleFavorite);
  const defaultThemeId = useSettingsStore((s) => s.settings.terminalTheme);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const updateSettings = useSettingsStore((s) => s.update);
  const activeThemeId = pane.terminalTheme ?? defaultThemeId;

  function doSplit(orientation: 'horizontal' | 'vertical', position: SplitPosition) {
    splitPane(tabId, pane.id, orientation, position);
    setMenuOpen(false);
    setThemeOpen(false);
  }

  const custom = useProjectCustomStore((s) =>
    pane.projectPath ? selectCustom(s.customs, pane.projectPath) : DEFAULT_CUSTOM
  );
  const autoColor = pane.projectName ? getProjectColor(pane.projectName) : null;
  // Cor por painel (customColor) tem prioridade sobre a cor do projeto.
  const accent = pane.customColor ?? custom.color ?? autoColor?.border ?? 'var(--accent)';
  const accentBadge = pane.customColor
    ? `${pane.customColor}26`
    : custom.color ? `${custom.color}26` : (autoColor?.badge ? `${autoColor.badge}26` : 'var(--accent-soft)');

  const displayName = pane.customTitle || custom.alias || pane.projectName || 'Sem projeto';
  const displayEmoji = custom.emoji;

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!splitOpen) return;
    function onClick(e: MouseEvent) {
      if (splitRef.current && !splitRef.current.contains(e.target as Node)) setSplitOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [splitOpen]);

  return (
    <div
      ref={headerRef}
      className="flex flex-col"
      style={{
        borderBottom: `1px solid color-mix(in srgb, ${accent} 48%, var(--border-default))`,
        background: `color-mix(in srgb, ${accent} 22%, var(--bg-surface))`,
      }}
    >
      {/* ===== Linha 1 — identidade + ações ===== */}
      <div className="flex h-12 items-center gap-3 px-3.5">
      {/* ===== Identidade (alça de arraste para reordenar) ===== */}
      <div
        {...(dragHandleProps ?? {})}
        title={dragHandleProps ? 'Arraste para trocar a posição deste painel' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2.5 ${dragHandleProps ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 76%, white 16%) 0%, ${accent} 100%)`,
          color: '#fff',
          boxShadow: `0 4px 14px -3px color-mix(in srgb, ${accent} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.32)`,
        }}
      >
        {displayEmoji
          ? <span className="text-[18px] leading-none">{displayEmoji}</span>
          : <Folder size={17} strokeWidth={2.2} />}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          ref={nameRef}
          onDoubleClick={() => setEditTitleOpen(true)}
          title="Duplo-clique para renomear e mudar a cor deste terminal"
          className="cursor-text truncate text-[15.5px] font-bold tracking-[-0.015em] text-text-primary"
        >
          {displayName}
        </span>
        {editTitleOpen && nameRef.current && (
          <TitleColorPopover
            anchor={nameRef.current}
            initialTitle={pane.customTitle ?? ''}
            placeholder={pane.projectName ?? 'Terminal'}
            initialColor={pane.customColor ?? ''}
            onClose={() => setEditTitleOpen(false)}
            onSave={(title, color) => {
              updatePane(tabId, pane.id, {
                customTitle: title.trim() || undefined,
                customColor: color || undefined,
              });
              setEditTitleOpen(false);
            }}
          />
        )}
        {viewMode === 'terminal' && hasTerminal && (
          <StatusBadge status={liveStatus ?? (claudeRunning ? 'running' : undefined)} active={procActive} />
        )}
        {viewMode === 'terminal' && activeSkill && (
          <span
            title={`Skill em uso: ${activeSkill}`}
            className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-wider"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Sparkles size={9} /> {activeSkill}
          </span>
        )}
      </div>
      </div>

      {/* ===== Métricas vivas (MEM / CPU) — escondidas quando o painel aperta ===== */}
      {viewMode === 'terminal' && !compact && (
        <div className="ml-auto">
          <PaneMetrics terminalId={pane.terminalId} />
        </div>
      )}

      {/* ===== Ações ===== */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* providers movidos para a Linha 2 */}

        {/* Stepper de fonte do terminal — A menor / A maior */}
        {viewMode === 'terminal' && !tiny && (
          <div className="flex items-center gap-0.5 rounded-xl bg-bg-base p-1" style={{ boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}>
            <IconBtn onClick={() => updateSettings({ fontSize: Math.max(9, fontSize - 1) })} title={`Diminuir a fonte do terminal (${fontSize}px)`} disabled={fontSize <= 9}>
              <span className="font-bold leading-none" style={{ fontSize: 11 }}>A</span>
            </IconBtn>
            <IconBtn onClick={() => updateSettings({ fontSize: Math.min(24, fontSize + 1) })} title={`Aumentar a fonte do terminal (${fontSize}px)`} disabled={fontSize >= 24}>
              <span className="font-bold leading-none" style={{ fontSize: 17 }}>A</span>
            </IconBtn>
          </div>
        )}

        {viewMode === 'terminal' && (
          <div className="flex items-center gap-0.5 rounded-xl bg-bg-base p-1" style={{ boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}>
            {pane.projectPath && (
              <IconBtn
                onClick={() => toggleTreeFor(pane.projectPath!, pane.projectName ?? 'Projeto')}
                title="Mostrar/ocultar a árvore de arquivos deste projeto (Ctrl+B)"
                active={treeActive}
                activeColor="var(--accent)"
              >
                <FolderTree size={16} />
              </IconBtn>
            )}

            <ClaudeSessionsMenu
              projectPath={pane.projectPath}
              hasTerminal={!!hasTerminal}
              onContinue={onResumeClaude}
              onResume={onResumeSession}
              accountId={accountId}
            />

            {pane.projectPath && !narrow && (
              <IconBtn onClick={onOpenBrowser} title="Abrir o Browser deste projeto ao lado (na URL do dev, se rodando)">
                <Globe size={16} />
              </IconBtn>
            )}

            {pane.projectPath && !narrow && (
              <div className="relative" ref={splitRef}>
                <IconBtn
                  onClick={() => setSplitOpen((v) => !v)}
                  title="Dividir tela (terminal ou browser ao lado/abaixo)"
                  active={splitOpen}
                  activeColor="var(--accent)"
                >
                  <SplitSquareHorizontal size={16} />
                </IconBtn>
                {splitOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Abrir ao lado / abaixo
                    </div>
                    {([
                      { mode: 'browser' as const, icon: <Globe size={13} />, label: 'Browser' },
                      { mode: 'terminal' as const, icon: <TerminalSquare size={13} />, label: 'Terminal' },
                    ]).map((s) => (
                      <div key={s.mode} className="flex items-center gap-1 px-2 py-1">
                        <span className="flex flex-1 items-center gap-2 px-1 text-[12px] text-text-secondary">
                          <span className="text-text-tertiary">{s.icon}</span>{s.label}
                        </span>
                        <button
                          onClick={() => splitWith('vertical', s.mode)}
                          title={`${s.label} ao lado`}
                          className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                        >
                          <Columns2 size={13} />
                        </button>
                        <button
                          onClick={() => splitWith('horizontal', s.mode)}
                          title={`${s.label} abaixo`}
                          className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                        >
                          <Rows2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!narrow && (
              <>
                <span className="mx-1 h-5 w-px shrink-0" style={{ background: 'var(--border-default)' }} />

                <IconBtn onClick={onToggleSpeech} disabled={!hasTerminal}
                  title={recording ? 'Parar gravação' : 'Ditar por voz (PT-BR)'}
                  active={recording} activeColor="var(--danger)">
                  {recording ? <MicOff size={16} className="claude-dot" /> : <Mic size={16} />}
                </IconBtn>

                {pane.projectPath && (
                  <span ref={paletteRef} className="flex">
                    <IconBtn onClick={() => setEditingProject((v) => !v)} title="Personalizar projeto — cor e ícone" active={editingProject} activeColor="var(--accent)">
                      <Palette size={16} />
                    </IconBtn>
                  </span>
                )}

                <IconBtn onClick={onClearTerminal} title="Limpar terminal">
                  <RotateCcw size={16} />
                </IconBtn>
              </>
            )}
          </div>
        )}

        <div className="relative" ref={menuRef}>
          <IconBtn onClick={() => setMenuOpen((v) => !v)} title="Mais opções">
            <MoreHorizontal size={16} />
          </IconBtn>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
              {/* ===== Adicionar terminal — 4 direções ===== */}
              <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Adicionar terminal
              </div>
              <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                <DirectionBtn
                  icon={<PanelTop size={16} />}
                  label="Acima"
                  onClick={() => doSplit('horizontal', 'before')}
                />
                <DirectionBtn
                  icon={<PanelBottom size={16} />}
                  label="Abaixo"
                  shortcut="Ctrl+Shift+_"
                  onClick={() => doSplit('horizontal', 'after')}
                />
                <DirectionBtn
                  icon={<PanelLeft size={16} />}
                  label="Esquerda"
                  onClick={() => doSplit('vertical', 'before')}
                />
                <DirectionBtn
                  icon={<PanelRight size={16} />}
                  label="Direita"
                  shortcut="Ctrl+Shift+\"
                  onClick={() => doSplit('vertical', 'after')}
                />
              </div>

              {/* ===== Ações rápidas — aparecem só quando os ícones da barra colapsam ===== */}
              {narrow && (
                <>
                  <div className="border-t border-border-subtle" />
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Ações rápidas
                  </div>
                  {pane.projectPath && (
                    <MenuItem
                      icon={<FolderTree size={13} />}
                      label="Árvore de arquivos"
                      shortcut="Ctrl+B"
                      onClick={() => {
                        if (pane.projectPath) toggleTreeFor(pane.projectPath, pane.projectName ?? 'Projeto');
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {pane.projectPath && (
                    <MenuItem
                      icon={<Globe size={13} />}
                      label="Abrir browser ao lado"
                      onClick={() => { onOpenBrowser(); setMenuOpen(false); }}
                    />
                  )}
                  <MenuItem
                    icon={recording ? <MicOff size={13} /> : <Mic size={13} />}
                    label={recording ? 'Parar gravação' : 'Ditar por voz (PT-BR)'}
                    onClick={() => { onToggleSpeech(); setMenuOpen(false); }}
                  />
                  <MenuItem
                    icon={<RotateCcw size={13} />}
                    label="Limpar terminal"
                    onClick={() => { onClearTerminal(); setMenuOpen(false); }}
                  />
                </>
              )}

              {/* ===== Projeto ===== */}
              {pane.projectPath && (
                <>
                  <div className="border-t border-border-subtle" />
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Projeto
                  </div>
                  <MenuItem
                    icon={
                      <Star
                        size={13}
                        fill={custom.favorite ? 'currentColor' : 'none'}
                        style={{ color: custom.favorite ? 'var(--warning)' : undefined }}
                      />
                    }
                    label={custom.favorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
                    onClick={() => {
                      if (pane.projectPath) void toggleFavorite(pane.projectPath);
                    }}
                  />
                  <div ref={editAnchorRef}>
                    <MenuItem
                      icon={<Pencil size={13} />}
                      label="Editar nome, cor e ícone"
                      onClick={() => {
                        setMenuOpen(false);
                        setThemeOpen(false);
                        setEditingProject(true);
                      }}
                    />
                  </div>
                </>
              )}

              {/* ===== Aparência (tema do terminal) ===== */}
              <div className="border-t border-border-subtle" />
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Aparência
              </div>
              <button
                onClick={() => setThemeOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Palette size={13} className="opacity-80" />
                <span className="flex-1 text-[12px]">Tema do terminal</span>
                <span className="truncate text-[10px] text-text-muted">
                  {TERMINAL_THEMES.find((t) => t.id === activeThemeId)?.label ?? 'Padrão'}
                </span>
                <ChevronRight
                  size={12}
                  className="transition-transform"
                  style={{ transform: themeOpen ? 'rotate(90deg)' : 'none' }}
                />
              </button>
              {themeOpen && (
                <div className="max-h-72 overflow-y-auto border-t border-border-subtle bg-bg-base/40">
                  {TERMINAL_THEME_GROUPS.map((group) => {
                    const items = TERMINAL_THEMES.filter((t) => t.group === group.id);
                    if (items.length === 0) return null;
                    return (
                      <div key={group.id}>
                        <div className="px-3 pt-2 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
                          {group.label}
                        </div>
                        {items.map((t) => {
                          const isActive = activeThemeId === t.id;
                          const [bg, fg, ac] = t.preview;
                          return (
                            <button
                              key={t.id}
                              onClick={() => {
                                updatePane(tabId, pane.id, { terminalTheme: t.id });
                                setMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-hover"
                            >
                              <span
                                className="flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle text-[8.5px] font-bold"
                                style={{ background: bg, color: fg }}
                              >
                                &gt;_
                                <span
                                  className="ml-0.5 inline-block h-1 w-1 rounded-full"
                                  style={{ background: ac }}
                                />
                              </span>
                              <span className="flex-1 truncate text-[11.5px] text-text-secondary">
                                {t.label}
                              </span>
                              {isActive && <Check size={11} className="shrink-0 text-accent" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {pane.terminalTheme && (
                    <button
                      onClick={() => {
                        updatePane(tabId, pane.id, { terminalTheme: undefined });
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 border-t border-border-subtle px-3 py-2 text-left text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
                    >
                      <ResetIcon size={11} />
                      <span className="text-[11px]">Usar tema padrão das configurações</span>
                    </button>
                  )}
                </div>
              )}

              {/* ===== Destrutivo ===== */}
              <div className="border-t border-border-subtle" />
              <MenuItem
                icon={<X size={13} />}
                label="Fechar terminal"
                shortcut="Ctrl+W"
                tone="danger"
                onClick={() => { closePane(tabId, pane.id); setMenuOpen(false); }}
              />
            </div>
          )}
          {editingProject && pane.projectPath && (paletteRef.current || editAnchorRef.current || menuRef.current) && (
            <ProjectEditPopover
              projectPath={pane.projectPath}
              projectName={pane.projectName ?? ''}
              anchor={(paletteRef.current ?? editAnchorRef.current ?? menuRef.current)!}
              onClose={() => setEditingProject(false)}
            />
          )}
        </div>
      </div>
      </div>

      {/* ===== Linha 2 — caminho · git/dev · agentes IA ===== */}
      {viewMode === 'terminal' && (
        <div
          className="flex h-9 min-w-0 items-center gap-2 border-t px-3"
          style={{
            borderColor: `color-mix(in srgb, ${accent} 22%, var(--border-subtle))`,
            background: `color-mix(in srgb, ${accent} 10%, var(--bg-base))`,
          }}
        >
          {/* Contexto à esquerda: caminho · git · dev · modelo */}
          {pane.projectPath && !compact && (
            <span
              className="min-w-0 shrink truncate font-mono text-[10.5px] text-text-tertiary"
              title={pane.projectPath}
              style={{ maxWidth: 200 }}
            >
              {shortPath(pane.projectPath)}
            </span>
          )}
          {pane.projectPath && !tiny && <GitChip projectPath={pane.projectPath} />}
          {pane.projectPath && (
            <DevServerControl projectPath={pane.projectPath} variant="header" accent={accent} />
          )}
          {pane.projectPath && !narrow && <RemoteChip projectPath={pane.projectPath} accent={accent} compact={compact} />}
          {onSetAccount && !compact && <AccountChip accountId={accountId} onSelect={onSetAccount} accent={accent} />}
          {onSetAccount && !compact && <ModelUsageChip model={claudeModel ?? null} accent={accent} accountId={accountId} />}

          {/* Agentes IA à direita (rodam neste terminal) */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!compact && (
              <span className="mr-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                <Sparkles size={11} className="text-accent" /> Rodar
              </span>
            )}
            {aiProviders.filter((p) => p.enabled).map((p) => {
              const running = p.command.trim() === 'claude' && (liveStatus === 'running' || claudeRunning);
              return (
                <button
                  key={p.id}
                  onClick={() => runProvider(p)}
                  disabled={!hasTerminal}
                  title={`Rodar ${p.label} (${p.command}) neste terminal`}
                  className={`group flex h-7 items-center rounded-lg text-[11.5px] font-bold transition-all duration-150 hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 ${narrow ? 'w-7 justify-center' : 'gap-1.5 px-2.5'}`}
                  style={{
                    background: running
                      ? `linear-gradient(135deg, color-mix(in srgb, ${p.color} 82%, white 18%), ${p.color})`
                      : `color-mix(in srgb, ${p.color} 22%, transparent)`,
                    color: running ? '#fff' : p.color,
                    boxShadow: running
                      ? `0 3px 12px -3px ${p.color}, inset 0 1px 0 rgba(255,255,255,0.25)`
                      : `inset 0 0 0 1px color-mix(in srgb, ${p.color} 46%, transparent)`,
                  }}
                >
                  {running
                    ? <span className="claude-dot h-1.5 w-1.5 rounded-full bg-white" />
                    : <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />}
                  {!narrow && p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function paneBaseName(p: string) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

/** Chip de acesso remoto: liga/desliga o projeto e mostra uso recente via Telegram. */
function RemoteChip({ projectPath, accent, compact }: { projectPath: string; accent: string; compact: boolean }) {
  const enabled = useRemoteStore((s) => s.projectsEnabled.includes(projectPath));
  const paired = useRemoteStore((s) => s.status.paired);
  const botRunning = useRemoteStore((s) => s.status.running);
  const setProjectEnabled = useRemoteStore((s) => s.setProjectEnabled);
  const base = paneBaseName(projectPath);
  const lastTs = useRemoteStore((s) => {
    for (const e of s.history) if (e.project === base) return e.ts; // history é recente-primeiro
    return 0;
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const sinceMin = lastTs ? (Date.now() - lastTs) / 60000 : Infinity;
  const inUse = sinceMin < 2;
  const recent = sinceMin < 60;
  const color = enabled ? (inUse ? 'var(--success)' : accent) : 'var(--text-muted)';
  const label = !enabled ? 'Remoto' : inUse ? 'Em uso' : recent ? relTime(lastTs) : 'Remoto';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={enabled ? 'Acesso remoto ligado — clique para detalhes' : 'Acesso remoto desligado — clique para ativar'}
        className="flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors"
        style={{
          borderColor: open ? color : enabled ? `color-mix(in srgb, ${color} 40%, transparent)` : 'var(--border-subtle)',
          background: enabled ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--bg-base)',
          color: enabled ? color : 'var(--text-tertiary)',
        }}
      >
        <span className="relative flex">
          <Smartphone size={12} />
          {enabled && recent && (
            <span className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ${inUse ? 'claude-dot' : ''}`} style={{ background: inUse ? 'var(--success)' : accent }} />
          )}
        </span>
        {!compact && <span className="max-w-[80px] truncate">{label}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-text-primary">Acesso remoto</div>
              <div className="text-[10px] text-text-muted">Controlar este projeto pelo Telegram</div>
            </div>
            <button
              role="switch" aria-checked={enabled}
              onClick={() => void setProjectEnabled(projectPath, !enabled)}
              className="relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors"
              style={{ background: enabled ? 'var(--accent)' : 'var(--bg-active)' }}
            >
              <span className="absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all" style={{ left: enabled ? 17 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
            </button>
          </div>
          <div className="space-y-1 border-t border-border-subtle px-3 py-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: paired && botRunning ? 'var(--success)' : 'var(--text-disabled)' }} />
              {!paired ? 'Celular não pareado' : botRunning ? 'Bot conectado' : 'Bot desligado'}
            </div>
            <div className="text-text-muted">
              {lastTs ? `Última atividade remota: ${relTime(lastTs)}` : 'Nunca usado remotamente'}
            </div>
          </div>
          {!paired && (
            <div className="border-t border-border-subtle px-3 py-2 text-[10px] leading-relaxed text-text-muted">
              Configure o bot em <span className="font-semibold text-text-tertiary">Configurações → Remoto</span>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Estado unificado do terminal: trabalhando (agente OU CPU ativa) · responder · pronto · ocioso. */
function StatusBadge({ status, active }: { status?: ClaudeStatus; active?: boolean }) {
  const kind =
    status === 'approval' ? 'respond'
      : status === 'running' || active ? 'work'
        : status === 'waiting' ? 'ready'
          : 'idle';
  const cfg = {
    work: { label: 'Trabalhando', color: 'var(--success)', soft: 'var(--success-soft)', glow: true, title: 'Trabalhando agora (agente ou processo ativo)' },
    respond: { label: 'Responder', color: 'var(--warning)', soft: 'var(--warning-soft)', glow: true, title: 'O Claude aguarda sua confirmação' },
    ready: { label: 'Pronto', color: 'var(--success)', soft: 'var(--success-soft)', glow: false, title: 'Claude terminou — sua vez' },
    idle: { label: 'Ocioso', color: 'var(--text-muted)', soft: 'var(--bg-active)', glow: false, title: 'Terminal ocioso' },
  }[kind];
  return (
    <span
      title={cfg.title}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.soft, color: cfg.color }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.glow ? 'claude-dot' : ''}`} style={{ background: kind === 'idle' ? 'var(--text-disabled)' : cfg.color, boxShadow: cfg.glow ? `0 0 7px ${cfg.color}` : 'none' }} />
      {cfg.label}
    </span>
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function ClaudeSessionsMenu({
  projectPath, hasTerminal, onContinue, onResume, accountId,
}: {
  projectPath: string | null;
  hasTerminal: boolean;
  onContinue: () => void;
  onResume: (sessionId: string, configDir?: string) => void;
  accountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; preview: string; mtimeMs: number; configDir: string }>>([]);
  const [loading, setLoading] = useState(false);
  // Config dir da conta deste terminal: as sessões ficam em <configDir>/projects,
  // então a busca (e o --resume) precisa olhar nessa conta, não só na ~/.claude.
  const configDir = useAccountsStore((s) => s.dirFor(accountId));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && projectPath) {
      setLoading(true);
      try {
        setSessions(await window.api.claude.sessions(projectPath, configDir || undefined));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <IconBtn onClick={() => void toggle()} disabled={!hasTerminal} title="Histórico de sessões do Claude" active={open} activeColor="var(--accent)">
        <History size={16} />
      </IconBtn>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <button
            onClick={() => { onContinue(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-text-secondary transition-colors hover:bg-bg-hover"
          >
            <History size={13} className="text-accent" />
            Continuar última sessão
            <span className="ml-auto font-mono text-[10px] text-text-muted">--continue</span>
          </button>
          <div className="border-t border-border-subtle" />
          <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Sessões anteriores
          </div>
          <div className="max-h-72 overflow-y-auto pb-1.5">
            {loading && (
              <div className="flex items-center justify-center gap-1.5 px-3 py-3 text-[11px] text-text-muted">
                <Loader2 size={13} className="animate-spin" /> carregando…
              </div>
            )}
            {!loading && sessions.length === 0 && (
              <div className="px-3 py-3 text-center text-[11px] text-text-muted">Nenhuma sessão encontrada</div>
            )}
            {!loading && sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => { onResume(s.id, s.configDir); setOpen(false); }}
                className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-hover"
                title={s.id}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[12px] text-text-secondary">{s.preview || '(sem prévia)'}</span>
                  <span className="shrink-0 text-[10px] text-text-muted">{relTime(s.mtimeMs)}</span>
                </div>
                <span className="truncate font-mono text-[9px] text-text-muted">{s.id.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountChip({
  accountId, onSelect, accent,
}: {
  accountId?: string;
  onSelect: (id: string) => void;
  accent: string;
}) {
  const accounts = useAccountsStore((s) => s.accounts);
  const defaultId = useAccountsStore((s) => s.defaultId);
  const identities = useAccountsStore((s) => s.identities);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Só faz sentido mostrar se há mais de uma conta.
  if (accounts.length < 2) return null;

  const current = accounts.find((a) => a.id === accountId)
    ?? accounts.find((a) => a.id === defaultId)
    ?? accounts[0];
  const currentIdent = current ? identities[current.id] : undefined;
  const label = current ? (currentIdent?.planLabel ?? current.label) : 'Conta';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Conta do Claude usada neste terminal"
        className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors hover:border-border-default"
        style={{ borderColor: open ? accent : 'var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}
      >
        <UserRound size={12} style={{ color: current?.color ?? accent }} />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Conta neste terminal
          </div>
          {accounts.map((a) => {
            const ident = identities[a.id];
            const isCurrent = a.id === (current?.id);
            return (
              <button
                key={a.id}
                onClick={() => { onSelect(a.id); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: a.color ? `color-mix(in srgb, ${a.color} 18%, transparent)` : 'var(--bg-active)' }}>
                  <UserRound size={12} style={{ color: a.color ?? 'var(--text-tertiary)' }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-text-secondary">{a.label}</span>
                  <span className="block truncate text-[10px] text-text-muted">
                    {ident?.connected
                      ? `${ident.planLabel ?? '—'}${ident.email ? ` · ${ident.email}` : ''}`
                      : 'não conectada'}
                  </span>
                </span>
                {isCurrent && <Check size={13} className="shrink-0 text-accent" />}
              </button>
            );
          })}
          <div className="border-t border-border-subtle px-3 py-2 text-[10px] text-text-muted">
            Gerencie as contas em <span className="font-semibold text-text-tertiary">Contas Claude</span> na barra lateral.
          </div>
        </div>
      )}
    </div>
  );
}

interface UsageWindow { key: string; label: string; utilization: number; resetsAt: string | null }
interface UsageData {
  ok: boolean;
  windows: UsageWindow[];
  extraUsage?: { enabled: boolean; utilization: number | null } | null;
  error?: string;
}

/** Cor da barra conforme a utilização. */
function barColor(util: number): string {
  if (util >= 95) return 'var(--danger)';
  if (util >= 80) return 'var(--warning)';
  return 'var(--info)';
}

/** "reseta em 36min" / "em 2h" / "em 4d". */
function fmtReset(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `reseta em ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `reseta em ${h}h`;
  const d = Math.round(h / 24);
  return `reseta em ${d}d`;
}

function ModelUsageChip({
  model, accent, accountId,
}: {
  model: string | null;
  accent: string;
  accountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const resolvedId = useAccountsStore((s) => s.accountFor(accountId)?.id ?? '');
  const usage = useAccountsStore((s) => (resolvedId ? s.usage[resolvedId] : undefined)) as UsageData | undefined;
  const loading = open && !usage;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && resolvedId) void useAccountsStore.getState().refreshUsage(resolvedId);
  }

  const label = model ?? 'Claude';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => void toggle()}
        title="Modelo em uso e consumo do Claude"
        className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors hover:border-border-default"
        style={{ borderColor: open ? accent : 'var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}
      >
        <Cpu size={12} style={{ color: accent }} />
        <span className="max-w-[140px] truncate">{label}</span>
        <Gauge size={11} className="opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border-default bg-bg-overlay shadow-lg">
          {/* Modelo */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
              <Sparkles size={13} style={{ color: accent }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-text-primary">{label}</div>
              <div className="text-[10px] text-text-muted">Modelo deste terminal</div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-1.5 px-3 py-4 text-[11px] text-text-muted">
              <Loader2 size={13} className="animate-spin" /> buscando uso…
            </div>
          )}

          {!loading && usage && !usage.ok && (
            <div className="px-3 py-3.5 text-[11px] leading-relaxed text-text-tertiary">
              Não consegui ler o uso do plano
              {usage.error ? <span className="text-text-muted"> ({usage.error})</span> : null}.
              <br />Faça login no Claude Code (rode <span className="font-mono text-text-tertiary">claude</span> uma vez).
            </div>
          )}

          {!loading && usage?.ok && (
            <div className="px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Uso do plano</div>
              {usage.windows.length === 0 && (
                <p className="py-1 text-[11px] text-text-muted">Sem dados de uso.</p>
              )}
              {usage.windows.map((w) => (
                <UsageBar key={w.key} window={w} />
              ))}
              {usage.extraUsage?.enabled && typeof usage.extraUsage.utilization === 'number' && (
                <UsageBar
                  window={{ key: 'extra', label: 'Créditos extras', utilization: usage.extraUsage.utilization, resetsAt: null }}
                />
              )}
              <p className="mt-2 text-[9.5px] leading-relaxed text-text-muted">
                Limites reais do plano (mesmo dado do <span className="font-mono text-text-tertiary">/status</span>).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsageBar({ window: w }: { window: UsageWindow }) {
  const color = barColor(w.utilization);
  const reset = fmtReset(w.resetsAt);
  const pct = Math.max(0, Math.min(100, w.utilization));
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-text-secondary">{w.label}</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{Math.round(w.utilization)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-active">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {reset && <div className="mt-0.5 text-[9.5px] text-text-muted">{reset}</div>}
    </div>
  );
}

function IconBtn({
  children, onClick, disabled, title, active, activeColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  activeColor?: string;
}) {
  const inactiveColor = 'var(--text-tertiary)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-25"
      style={{
        background: active ? `color-mix(in srgb, ${activeColor} 18%, transparent)` : 'transparent',
        color: active ? activeColor : inactiveColor,
        border: active ? `1px solid color-mix(in srgb, ${activeColor} 40%, transparent)` : '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (!active) {
          e.currentTarget.style.background = 'var(--accent-soft)';
          e.currentTarget.style.color = 'var(--accent-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = inactiveColor;
        }
      }}
    >
      {children}
    </button>
  );
}

function DirectionBtn({
  icon, label, shortcut, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} · ${shortcut}` : label}
      className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-2 text-left transition-colors hover:border-border-default hover:bg-bg-hover"
    >
      <span className="text-text-tertiary">{icon}</span>
      <span className="flex-1 text-[11.5px] font-medium text-text-secondary">{label}</span>
    </button>
  );
}

function MenuItem({
  icon, label, shortcut, onClick, tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--text-secondary)';
  const hoverBg = tone === 'danger' ? 'var(--danger-soft)' : 'var(--bg-hover)';
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
      style={{ color }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="opacity-80">{icon}</span>
      <span className="flex-1 text-[12px]">{label}</span>
      {shortcut && (
        <span className="font-mono text-[10px] text-text-muted">{shortcut}</span>
      )}
    </button>
  );
}
