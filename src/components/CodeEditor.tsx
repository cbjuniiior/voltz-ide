import { useEffect, useRef } from 'react';
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// ============================================================================
// Run setup SYNCHRONOUSLY at module load.
// This module is itself lazy-imported (React.lazy in EditorArea), so we still
// only pay the cost when the user opens their first file. But by the time the
// <Editor> React component first renders, both the worker map AND the loader
// config must already point at the bundled local Monaco — otherwise
// @monaco-editor/react silently falls back to the unpkg CDN, which never
// resolves inside an offline Electron window.
// ============================================================================
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_, label) {
    switch (label) {
      case 'json': return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default: return new editorWorker();
    }
  },
};
loader.config({ monaco });

// Map filename → Monaco language id. Monaco recognises many but a few
// project conventions (.env, Dockerfile) need explicit hints.
function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile')) return 'dockerfile';
  if (lower.startsWith('.env')) return 'shell';
  if (lower.endsWith('.gitignore') || lower.endsWith('.dockerignore')) return 'plaintext';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'plaintext',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    cc: 'cpp',
    c: 'c',
    h: 'cpp',
    hpp: 'cpp',
    php: 'php',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    txt: 'plaintext',
    log: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

interface Props {
  filePath: string;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  /** Light/dark — read from the app's data-theme attribute. */
  appTheme: 'light' | 'dark';
  /** Project root — used to query git diff against. */
  projectRoot: string;
  /** Linha a revelar (1-based) — ex.: ao abrir a partir da Busca. */
  revealLine?: number;
  /** Chamado depois que a linha foi revelada (para o pai limpar o pedido). */
  onRevealed?: () => void;
}

// Inject diff gutter styles once.
let diffStylesInjected = false;
function ensureDiffStyles() {
  if (diffStylesInjected) return;
  diffStylesInjected = true;
  const style = document.createElement('style');
  style.dataset.voltz = 'monaco-git-gutter';
  style.textContent = `
    .voltz-diff-added { background: var(--success); opacity: 0.7; width: 3px !important; margin-left: 3px; }
    .voltz-diff-modified { background: var(--warning); opacity: 0.7; width: 3px !important; margin-left: 3px; }
    .voltz-diff-deleted::before {
      content: ""; position: absolute; left: 3px; top: 50%;
      width: 6px; height: 2px; transform: translateY(-50%);
      background: var(--danger); opacity: 0.75;
    }
  `;
  document.head.appendChild(style);
}

export default function CodeEditor({ filePath, value, onChange, onSave, appTheme, projectRoot, revealLine, onRevealed }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffDecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const revealRef = useRef<{ line: number; done: () => void } | null>(null);

  function doReveal(line: number) {
    const ed = editorRef.current;
    if (!ed || !line) return false;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
    return true;
  }

  // Revela a linha pedida (quando vem da Busca). Tenta agora; se o editor ainda
  // não montou, guarda para aplicar no onMount.
  useEffect(() => {
    if (!revealLine) return;
    if (doReveal(revealLine)) {
      onRevealed?.();
      revealRef.current = null;
    } else {
      revealRef.current = { line: revealLine, done: () => onRevealed?.() };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealLine, filePath]);

  const language = detectLanguage(filePath);
  const filename = filePath.split(/[\\/]/).pop() ?? filePath;

  // Refresh git diff decorations after every change (debounced).
  useEffect(() => {
    ensureDiffStyles();
    let cancelled = false;
    const handle = setTimeout(async () => {
      const editor = editorRef.current;
      if (!editor || cancelled) return;
      const result = await window.api.files.gitDiff(projectRoot, filePath);
      if (cancelled || !editor.getModel()) return;
      if (!result.ok) return;

      const decorations: monaco.editor.IModelDeltaDecoration[] = [];
      for (const hunk of result.hunks) {
        const isPureDelete = hunk.added === 0 && hunk.deleted > 0;
        const isPureAdd = hunk.deleted === 0 && hunk.added > 0;
        const startLine = Math.max(1, hunk.startLine);
        if (isPureDelete) {
          decorations.push({
            range: new monaco.Range(startLine, 1, startLine, 1),
            options: {
              isWholeLine: false,
              linesDecorationsClassName: 'voltz-diff-deleted',
            },
          });
        } else {
          const klass = isPureAdd ? 'voltz-diff-added' : 'voltz-diff-modified';
          const endLine = Math.max(startLine, startLine + hunk.added - 1);
          decorations.push({
            range: new monaco.Range(startLine, 1, endLine, 1),
            options: {
              isWholeLine: false,
              linesDecorationsClassName: klass,
            },
          });
        }
      }
      if (!diffDecorationsRef.current) {
        diffDecorationsRef.current = editor.createDecorationsCollection();
      }
      diffDecorationsRef.current.set(decorations);
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [filePath, value, projectRoot]);

  return (
    <Editor
      key={filePath}
      path={filePath}
      defaultLanguage={language}
      defaultValue={value}
      language={language}
      theme={appTheme === 'light' ? 'vs' : 'vs-dark'}
      onChange={(v) => onChange(v ?? '')}
      onMount={(editor, monacoInstance) => {
        editorRef.current = editor;
        // Ctrl+S / Cmd+S → save
        editor.addCommand(
          monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
          () => saveRef.current(),
        );
        // Aplica um reveal que chegou antes do editor montar.
        if (revealRef.current) {
          const { line, done } = revealRef.current;
          revealRef.current = null;
          setTimeout(() => { if (doReveal(line)) done(); }, 0);
        }
      }}
      options={{
        fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        minimap: { enabled: true, renderCharacters: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'gutter',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        formatOnPaste: true,
        tabSize: 2,
        insertSpaces: true,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        // Provide a stable model URI per file so Monaco preserves cursor/history
        // when switching tabs.
      }}
      loading={
        <div className="flex h-full items-center justify-center text-[11px] text-text-muted">
          Carregando editor — <span className="ml-1 truncate">{filename}</span>
        </div>
      }
    />
  );
}
