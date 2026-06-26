import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  X, Circle, FileText, AlertTriangle, ChevronRight, Save, MessageSquare,
  GitCompareArrows, RotateCw,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import { collectLeaves } from '@/lib/layoutTree';
import { toast } from '@/stores/toasts';

// Monaco only enters the bundle when the user actually opens a file. The
// React.lazy boundary lets Vite emit Monaco as its own chunk.
const CodeEditor = lazy(() => import('./CodeEditor'));

interface Props {
  workspaceTabId: string;
}

export function EditorArea({ workspaceTabId }: Props) {
  const tab = useEditorStore((s) => s.byTab[workspaceTabId]);
  const setActive = useEditorStore((s) => s.setActive);
  const setContent = useEditorStore((s) => s.setContent);
  const closeFile = useEditorStore((s) => s.closeFile);
  const saveFile = useEditorStore((s) => s.saveFile);
  const reloadFile = useEditorStore((s) => s.reloadFile);
  const externallyChanged = useEditorStore((s) => s.externallyChanged);
  const clearExternalChange = useEditorStore((s) => s.clearExternalChange);
  const pendingReveal = useEditorStore((s) => s.pendingReveal);
  const consumeReveal = useEditorStore((s) => s.consumeReveal);
  const autoSave = useSettingsStore((s) => s.settings.editorAutoSave);
  const autoSaveDelay = useSettingsStore((s) => s.settings.editorAutoSaveDelayMs);
  const appTheme = useResolvedAppTheme();
  const autoSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activeFile = tab?.openFiles.find((f) => f.path === tab?.activePath) ?? null;

  // Ctrl+W to close the active sub-tab when focus is anywhere in the editor area.
  // The main process owns Ctrl+W on the workspace level (closes the whole tab),
  // so we only react to its variant Ctrl+Alt+W to avoid colliding.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.altKey && e.key.toLowerCase() === 'w' && activeFile) {
        e.preventDefault();
        e.stopPropagation();
        void confirmAndClose(activeFile.path);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.path]);

  async function confirmAndClose(path: string) {
    const file = tab?.openFiles.find((f) => f.path === path);
    if (!file) return;
    const dirty = file.content !== file.savedContent;
    if (dirty) {
      const ok = window.confirm(`"${file.name}" tem alterações não salvas. Fechar mesmo assim?`);
      if (!ok) return;
    }
    closeFile(workspaceTabId, path);
  }

  async function handleSave() {
    if (!activeFile) return;
    const r = await saveFile(workspaceTabId, activeFile.path);
    if (r.ok) toast.success('Salvo', activeFile.name);
    else toast.error('Falha ao salvar', r.error);
  }

  // Auto-save: when enabled, debounce setContent → saveFile per file.
  function handleEditorChange(filePath: string, next: string) {
    setContent(workspaceTabId, filePath, next);
    if (!autoSave) return;
    const timers = autoSaveTimers.current;
    const prev = timers.get(filePath);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      // Re-check dirty inside the timeout (could've been saved manually).
      const isDirty = useEditorStore.getState().isDirty(workspaceTabId, filePath);
      if (isDirty) void saveFile(workspaceTabId, filePath);
      timers.delete(filePath);
    }, autoSaveDelay);
    timers.set(filePath, handle);
  }

  // Clear pending auto-save timers on unmount to avoid writes against a closed
  // workspace tab.
  useEffect(() => () => {
    autoSaveTimers.current.forEach((t) => clearTimeout(t));
    autoSaveTimers.current.clear();
  }, []);

  // === Claude integration: send a prompt about the active file into the
  //     terminal of the same workspace tab (first leaf with a project). ===
  async function sendToTerminal(prompt: string) {
    const workspace = useWorkspaceStore.getState();
    const wTab = workspace.tabs.find((t) => t.id === workspaceTabId);
    if (!wTab) return;
    const leaf = collectLeaves(wTab.root).find((l) => l.terminalId);
    if (!leaf?.terminalId) {
      toast.warning('Sem terminal ativo', 'Abre um terminal nessa aba antes.');
      return;
    }
    window.api.pty.write(leaf.terminalId, prompt);
  }

  async function askClaudeReview() {
    if (!activeFile?.projectRoot) return;
    const rel = activeFile.path
      .replace(activeFile.projectRoot, '')
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/');
    await sendToTerminal(`Faça um code review crítico do arquivo @${rel}. Aponte bugs, problemas de segurança e melhorias acionáveis.`);
    toast.info('Prompt enviado pro terminal', 'Aperte Enter no terminal pra executar.');
  }

  async function showDiffToClaude() {
    if (!activeFile?.projectRoot) return;
    const rel = activeFile.path
      .replace(activeFile.projectRoot, '')
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/');
    await sendToTerminal(`Olhe o diff de @${rel} (git diff HEAD) e me explica o que mudou e se tem algum problema.`);
    toast.info('Prompt enviado pro terminal', 'Aperte Enter no terminal pra executar.');
  }

  if (!tab || tab.openFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-base text-text-muted">
        <FileText size={28} className="opacity-40" />
        <p className="text-[12px]">Nenhum arquivo aberto</p>
        <p className="max-w-xs text-center text-[11px] text-text-disabled">
          Clique num arquivo na árvore à esquerda pra abrir aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg-base">
      {/* Sub-tabs */}
      <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border-subtle bg-bg-surface px-2 pt-1.5">
        {tab.openFiles.map((file) => {
          const isActive = file.path === tab.activePath;
          const isDirty = file.content !== file.savedContent;
          return (
            <div
              key={file.path}
              onClick={() => setActive(workspaceTabId, file.path)}
              onMouseDown={(e) => {
                // Middle click closes
                if (e.button === 1) {
                  e.preventDefault();
                  void confirmAndClose(file.path);
                }
              }}
              className="group flex h-7 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 text-[11.5px] transition-colors"
              style={{
                background: isActive ? 'var(--bg-base)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderTop: '1px solid ' + (isActive ? 'var(--border-default)' : 'transparent'),
                borderLeft: '1px solid ' + (isActive ? 'var(--border-default)' : 'transparent'),
                borderRight: '1px solid ' + (isActive ? 'var(--border-default)' : 'transparent'),
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              title={file.path}
            >
              {file.error
                ? <AlertTriangle size={11} className="shrink-0 text-warning" />
                : <FileText size={11} className="shrink-0 opacity-60" />}
              <span className="flex-1 truncate font-medium">{file.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); void confirmAndClose(file.path); }}
                className="flex h-4 w-4 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
                aria-label="Fechar"
                title="Fechar (Ctrl+Alt+W ou clique do meio)"
              >
                {isDirty
                  ? <Circle size={8} fill="currentColor" className="text-accent group-hover:hidden" />
                  : null}
                <X size={11} className={isDirty ? 'hidden group-hover:block' : 'block'} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Breadcrumbs + actions */}
      {activeFile && !activeFile.loading && !activeFile.error && (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-base/40 px-3 text-[10.5px]">
          <Breadcrumbs root={activeFile.projectRoot} path={activeFile.path} />
          {externallyChanged[activeFile.path] && (
            <button
              onClick={async () => {
                await reloadFile(workspaceTabId, activeFile.path);
                clearExternalChange(activeFile.path);
                toast.info('Recarregado', activeFile.name);
              }}
              className="ml-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
              title="O arquivo mudou em disco. Recarregar pra ver."
            >
              <RotateCw size={10} />
              Mudou em disco — recarregar
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ToolbarBtn
              onClick={handleSave}
              disabled={activeFile.content === activeFile.savedContent}
              icon={<Save size={11} />}
              label="Salvar"
              shortcut="Ctrl+S"
            />
            <ToolbarBtn
              onClick={() => void showDiffToClaude()}
              icon={<GitCompareArrows size={11} />}
              label="Mostrar diff pro Claude"
            />
            <ToolbarBtn
              onClick={() => void askClaudeReview()}
              icon={<MessageSquare size={11} />}
              label="Pedir review do Claude"
            />
          </div>
        </div>
      )}

      {/* Editor body */}
      <div className="relative flex-1 overflow-hidden">
        {activeFile?.loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/60 backdrop-blur-sm">
            <div className="text-[11px] text-text-muted">Carregando {activeFile.name}…</div>
          </div>
        )}
        {activeFile?.error && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-danger-soft bg-danger-soft px-4 py-3 text-center">
              <AlertTriangle size={20} className="mx-auto mb-1 text-danger" />
              <div className="text-[12px] font-semibold text-danger">Não consegui abrir esse arquivo</div>
              <div className="mt-1 text-[11px] text-text-tertiary">{activeFile.error}</div>
            </div>
          </div>
        )}
        {activeFile && !activeFile.error && !activeFile.loading && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[11px] text-text-muted">
                Carregando editor…
              </div>
            }
          >
            <CodeEditor
              filePath={activeFile.path}
              value={activeFile.content}
              onChange={(v) => handleEditorChange(activeFile.path, v)}
              onSave={handleSave}
              appTheme={appTheme}
              projectRoot={activeFile.projectRoot}
              revealLine={pendingReveal && pendingReveal.path === activeFile.path ? pendingReveal.line : undefined}
              onRevealed={consumeReveal}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({ root, path }: { root: string; path: string }) {
  const sep = path.includes('\\') ? '\\' : '/';
  const rel = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]+/, '') : path;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const rootName = (root.split(/[\\/]/).filter(Boolean).pop() ?? root);
  return (
    <div className="flex min-w-0 items-center gap-1 truncate text-text-muted">
      <span className="font-semibold text-text-tertiary">{rootName}</span>
      {parts.length > 0 && <ChevronRight size={10} className="opacity-50" />}
      {parts.map((part, idx) => {
        const isLast = idx === parts.length - 1;
        return (
          <span key={`${idx}-${part}`} className="flex items-center gap-1">
            <span style={{ color: isLast ? 'var(--text-secondary)' : undefined }}>{part}</span>
            {!isLast && <ChevronRight size={10} className="opacity-50" />}
          </span>
        );
      })}
      {void sep}
    </div>
  );
}

function ToolbarBtn({
  onClick, disabled, icon, label, shortcut,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// Reads the current app theme. The app's data-theme attribute toggles between
// 'light' and 'dark' (when 'system', applyTheme already resolves to one of
// these). Reading the attribute keeps Monaco in sync without prop drilling.
function useResolvedAppTheme(): 'light' | 'dark' {
  const _settingsTheme = useSettingsStore((s) => s.settings.theme); // re-render on change
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setResolved(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  void _settingsTheme;
  return resolved;
}
