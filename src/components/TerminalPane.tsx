import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import type { PaneLeaf, RecentProject } from '@shared/types';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import { useProjectsStore } from '@/stores/projects';
import { useDevServersStore } from '@/stores/devServers';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { toast } from '@/stores/toasts';
import { useAttentionStore } from '@/stores/attention';
import { useClaudeStatusStore } from '@/stores/claudeStatus';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { notifyClaudeDone } from '@/lib/notify';
import { getTerminalTheme } from '@/lib/terminalThemes';
import { newId, collectLeaves } from '@/lib/layoutTree';
import { PaneHeader } from './PaneHeader';
import { BrowserPane } from './BrowserPane';
import { newAgentToken, setAgentScope, clearAgentScope } from '@/lib/browserScope';
import { getProjectColor } from '@/lib/projectColors';
import { FolderOpen, FolderPlus, X as XIcon, Star, ArrowLeftRight, Paperclip, Search, ChevronUp, ChevronDown } from 'lucide-react';

// Faz fit() do xterm com segurança. Um terminal display:none / tamanho-zero
// ainda não tem dimensões do renderer; fit() (e o syncScrollArea interno do
// xterm) então lê `dimensions` de undefined e lança — derrubando o app inteiro.
function safeFit(el: HTMLElement | null, fit: FitAddon | null): boolean {
  if (!el || !fit) return false;
  if (el.offsetParent === null || el.clientWidth === 0 || el.clientHeight === 0) return false;
  try { fit.fit(); return true; }
  catch { return false; }
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

// Caracteres/marcadores que o Claude Code emite enquanto trabalha (spinner +
// "esc to interrupt"). Quando param de chegar por um tempo, ele terminou.
const CLAUDE_ACTIVITY_RE = /[✻✶✷✸✹✺●]|esc to interrupt/i;
const CLAUDE_IDLE_MS = 1800;

// Modelo anunciado no banner do Claude Code. Ancorado em "· Claude" para casar
// só a linha do banner (ex.: "Opus 4.8 (1M context) with high effort · Claude
// Max") e NÃO o texto promocional ("Meet Fable 5, our newest model…").
const CLAUDE_MODEL_RE = /\b(Opus|Sonnet|Haiku|Fable)\s+([\d.]+)(?:[^\n·]*?\bwith\s+(\w+)\s+effort)?[^\n·]*?·\s*Claude/i;
// Skill em uso (best-effort): tool call "Skill(nome)" ou "Launching skill: nome".
const CLAUDE_SKILL_RE = /(?:Skill\(\s*|Launching skill:\s*|Invoking skill:\s*)["']?([a-z][\w:-]+)/i;
// Claude parou pedindo sua confirmação (prompt de aprovação de tool/edição).
const CLAUDE_APPROVAL_RE = /(?:Do you want to|Would you like to|❯\s*1\.\s*Yes|\n\s*1\.\s*Yes\b|\(y\/n\)|press\s+y\b|Esc to cancel)/i;
// Remove sequências ANSI antes de procurar o nome do modelo no output.
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

// URL local que um dev server costuma imprimir (Vite/Next/CRA/etc.). Usada para
// abrir o Browser automaticamente quando o dev sobe direto no terminal.
const DEV_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s)'"]*)?/i;

// Cor da seleção (com alpha) — o fundo do xterm é transparente, então sem isto
// a seleção do Ctrl+A fica praticamente invisível.
const SELECTION_BG = 'rgba(125,130,170,0.40)';
const DEFAULT_TERM_FONT = '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Shift a hex colour toward black (negative) or white (positive) by `amt` (0-1). */
function shiftHex(hex: string, amt: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const mix = (x: number) => Math.round(x + (t - x) * k);
  const to2 = (x: number) => x.toString(16).padStart(2, '0');
  return `#${to2(mix(c.r))}${to2(mix(c.g))}${to2(mix(c.b))}`;
}

/** Compute the chat-style colours from a terminal theme's background. */
function chatColumnColors(bg: string): { column: string; margin: string } {
  const c = parseHex(bg);
  if (!c) return { column: bg, margin: bg };
  const dark = relLuminance(c) < 0.5;
  // Margin sits a touch away from the column so the column reads as "raised".
  return {
    column: bg,
    margin: dark ? shiftHex(bg, -0.35) : shiftHex(bg, -0.05),
  };
}

/** Envolve em aspas duplas caminhos com espaço, p/ o shell e o Claude lerem como um token só. */
function quoteForDrop(p: string): string {
  return /\s/.test(p) && !/^".*"$/.test(p) ? `"${p}"` : p;
}

interface Props {
  tabId: string;
  pane: PaneLeaf;
  /** No modo canvas: mantém o header de controles, mas esconde o rodapé e
   *  desativa o drag-swap (o card do canvas fornece a alça de mover). */
  canvasMode?: boolean;
}

// Terminal themes live in src/lib/terminalThemes.ts and are decoupled from the
// app's light/dark mode. Each pane resolves to a theme via:
//   pane.terminalTheme (override) ?? settings.terminalTheme (default)

export function TerminalPane({ tabId, pane, canvasMode }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const offDataRef = useRef<(() => void) | null>(null);
  const offExitRef = useRef<(() => void) | null>(null);
  const awaitingApprovalRef = useRef(false);
  const [claudeRunning, setClaudeRunning] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pastedImage, setPastedImage] = useState<{ path: string; dataUrl: string } | null>(null);
  const pastedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claudeActiveRef = useRef(false);
  const notifyEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const projectNameRef = useRef<string | null>(null);

  function showPastedImage(payload: { path: string; dataUrl: string }) {
    if (pastedTimerRef.current) clearTimeout(pastedTimerRef.current);
    setPastedImage(payload);
    pastedTimerRef.current = setTimeout(() => {
      setPastedImage(null);
      pastedTimerRef.current = null;
    }, 5000);
  }

  function dismissPastedImage() {
    if (pastedTimerRef.current) clearTimeout(pastedTimerRef.current);
    pastedTimerRef.current = null;
    setPastedImage(null);
  }

  useEffect(() => () => {
    if (pastedTimerRef.current) clearTimeout(pastedTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    useClaudeStatusStore.getState().clear(pane.id);
  }, []);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  // Conta do Claude deste terminal → diretório CLAUDE_CONFIG_DIR.
  const accountDir = useAccountsStore((s) => s.dirFor(pane.claudeAccountId));
  const accountDirRef = useRef(accountDir);
  accountDirRef.current = accountDir;
  // CLAUDE_CONFIG_DIR a exportar (vazio na conta principal → default nativo do claude).
  const envConfigDir = useAccountsStore((s) => s.envConfigDirFor(pane.claudeAccountId));
  const envConfigDirRef = useRef(envConfigDir);
  envConfigDirRef.current = envConfigDir;
  const modelBufRef = useRef('');
  const modelBaseRef = useRef<string | null>(null);   // "Opus 4.8" (do transcript ou banner)
  const modelEffortRef = useRef<string | null>(null); // "high" (só do banner)
  function composeModel() {
    const base = modelBaseRef.current;
    if (!base) return;
    const next = modelEffortRef.current ? `${base} · ${modelEffortRef.current}` : base;
    setClaudeModel((prev) => (prev === next ? prev : next));
  }
  // Lê o modelo real do transcript (autoritativo) e atualiza o chip.
  function refreshModelFromTranscript() {
    if (!pane.projectPath) return;
    void window.api.claude.currentModel(pane.projectPath, accountDirRef.current).then((label) => {
      if (label) { modelBaseRef.current = label; composeModel(); }
    });
  }
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  // Token único deste terminal (escopo do navegador por aba). Exportado como
  // VOLTZ_TERMINAL_TOKEN no PTY → o claude o envia no header X-Voltz-Terminal.
  const agentTokenRef = useRef<string>(newAgentToken());
  // Registra este TERMINAL (agente) e a aba dele no escopo do navegador. Só
  // painéis de terminal são agentes; painéis de navegador são alvos, não agentes.
  useEffect(() => {
    if (pane.viewMode === 'browser') { clearAgentScope(pane.id); return; }
    setAgentScope(pane.id, agentTokenRef.current, tabId);
    return () => clearAgentScope(pane.id);
  }, [pane.id, tabId, pane.viewMode]);
  const settings = useSettingsStore((s) => s.settings);
  const updatePane = useWorkspaceStore((s) => s.updatePane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const isTabActive = useWorkspaceStore((s) => s.activeTabId === tabId);
  // Broadcast ligado E a aba tem ≥2 terminais → mostra o sinal de alerta.
  const broadcastActive = useWorkspaceStore((s) => {
    const t = s.tabs.find((tt) => tt.id === tabId);
    if (!t?.broadcast) return false;
    return collectLeaves(t.root).filter((l) => l.viewMode !== 'browser').length >= 2;
  });
  const openProjectInPane = useWorkspaceStore((s) => s.openProjectInPane);
  const draggingPaneId = useWorkspaceStore((s) => s.draggingPaneId);
  const setDraggingPane = useWorkspaceStore((s) => s.setDraggingPane);
  const swapPanes = useWorkspaceStore((s) => s.swapPanes);
  const [dropOver, setDropOver] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const projects = useProjectsStore((s) => s.projects);
  const custom = useProjectCustomStore((s) =>
    pane.projectPath ? selectCustom(s.customs, pane.projectPath) : null
  );

  const autoColor = pane.projectName ? getProjectColor(pane.projectName) : null;
  const accent = pane.customColor ?? custom?.color ?? autoColor?.border ?? 'var(--border-default)';
  // Kept for legacy reference (status bar text accent).
  const color = autoColor;

  // Mantém valores atuais acessíveis dentro do listener do PTY (que é registrado
  // uma vez, então não enxerga props/estado novos sem isto).
  notifyEnabledRef.current = settings.notifyClaudeIdle;
  soundEnabledRef.current = settings.soundClaudeIdle;
  projectNameRef.current = pane.projectName;

  // Disparado quando o Claude para de produzir output (terminou/aguardando).
  function onClaudeIdle() {
    if (!claudeActiveRef.current) return;
    claudeActiveRef.current = false;
    const awaiting = awaitingApprovalRef.current;
    // 'approval' = parou pedindo sua confirmação; 'waiting' = terminou.
    useClaudeStatusStore.getState().setStatus(pane.id, awaiting ? 'approval' : 'waiting');
    if (!awaiting) {
      useClaudeStatusStore.getState().clearSkill(pane.id); // skill terminou junto
      modelBufRef.current = ''; // zera o buffer p/ não redetectar a mesma skill
    }
    // Confirma o modelo real pelo transcript (que acabou de ser gravado).
    refreshModelFromTranscript();
    const focused = document.hasFocus();
    const isActiveTab = useWorkspaceStore.getState().activeTabId === tabId;
    // Você está olhando ESTA aba agora? Se não (outra aba OU janela desfocada),
    // marca atenção e dispara o aviso (som/notificação) conforme as preferências.
    const attending = isActiveTab && focused;
    if (!attending) {
      useAttentionStore.getState().mark(tabId);
      if (notifyEnabledRef.current || soundEnabledRef.current) {
        notifyClaudeDone(projectNameRef.current ?? '', {
          sound: soundEnabledRef.current,
          system: notifyEnabledRef.current,
          approval: awaiting,
        });
      }
    }
  }

  // Chat-style column colours derived from the active terminal theme.
  const activeThemeId = pane.terminalTheme ?? settings.terminalTheme;
  const [chatColors, setChatColors] = useState(() =>
    chatColumnColors(getTerminalTheme(activeThemeId).theme.background ?? '#1a1815')
  );

  // Cada painel é terminal OU browser (este último nasce de um split dedicado).
  // Coerce any stale persisted 'chat' value back to 'terminal'.
  const viewMode: 'terminal' | 'browser' = pane.viewMode === 'browser' ? 'browser' : 'terminal';

  // Refaz o fit quando o painel volta a ficar visível (troca de aba de volta ou
  // browser→terminal). O ResizeObserver não dispara se só a visibilidade mudou,
  // não o tamanho — sem isto o terminal fica com dimensões antigas.
  useEffect(() => {
    if (!isTabActive || viewMode !== 'terminal') return;
    const id = requestAnimationFrame(() => {
      if (safeFit(containerRef.current, fitRef.current) && ptyIdRef.current && termRef.current) {
        try { window.api.pty.resize(ptyIdRef.current, termRef.current.cols, termRef.current.rows); }
        catch { /* ignore */ }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isTabActive, viewMode]);

  const devServer = useDevServersStore((s) => (pane.projectPath ? s.byPath[pane.projectPath] : undefined));

  // Abre o Browser deste projeto num split à direita, já na URL do dev (se houver).
  function openBrowser() {
    if (!pane.projectPath || !pane.projectName) return;
    useWorkspaceStore.getState().openBrowserBeside(tabId, pane.id, pane.projectName, pane.projectPath, devServer?.url ?? undefined);
  }

  // O auto-open de dev iniciado pelo botão é centralizado no devServers store
  // (cobre iniciar de qualquer lugar). Aqui só detectamos a URL impressa no
  // terminal quando o dev é rodado à mão / pelo Claude (ver onData abaixo).
  const devUrlOpenedRef = useRef<string | null>(null);
  const autoOpenRef = useRef(settings.autoOpenBrowserOnDev);
  autoOpenRef.current = settings.autoOpenBrowserOnDev;

  // Lê o modelo real do transcript ao montar (cobre sessões retomadas).
  useEffect(() => {
    refreshModelFromTranscript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.projectPath]);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const initialThemeId = pane.terminalTheme ?? settings.terminalTheme;
    const term = new Terminal({
      fontFamily: settings.terminalFontFamily || DEFAULT_TERM_FONT,
      fontSize: settings.fontSize,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: settings.terminalCursorBlink,
      cursorStyle: settings.terminalCursorStyle,
      cursorWidth: 2,
      allowProposedApi: true,
      allowTransparency: true,
      // Paint the bg on the wrapping column instead, so internal padding shows
      // the same colour as the terminal — gives a roomy chat-panel feel.
      theme: { ...getTerminalTheme(initialThemeId).theme, background: 'rgba(0,0,0,0)', selectionBackground: SELECTION_BG },
      scrollback: 10000,
      scrollSensitivity: 3,
      fastScrollSensitivity: 8,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    // Unicode 11 — largura correta de emojis/CJK (o Claude usa emojis).
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    // Busca no scrollback (Ctrl+F).
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;
    term.open(containerEl);
    // WebGL — renderização por GPU (muito mais fluida). Cai no renderizador padrão
    // automaticamente se o contexto WebGL falhar ou for perdido.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { try { webgl.dispose(); } catch { /* ignore */ } });
      term.loadAddon(webgl);
    } catch { /* sem WebGL — usa o renderizador DOM padrão */ }
    safeFit(containerEl, fit);
    // Não rouba o foco do navegador quando o painel nasce/está em modo browser
    // (senão a barra de endereço não aceita digitação).
    if (pane.viewMode !== 'browser') term.focus();
    termRef.current = term;
    fitRef.current = fit;

    // Scroll em TUIs de tela cheia (less/vim/htop/man…): o buffer alternativo não
    // tem scrollback, então a roda do mouse vira setas ↑/↓ (que esses programas
    // entendem). No buffer normal o xterm rola o histórico sozinho.
    const onWheel = (e: WheelEvent) => {
      const t = termRef.current;
      const pty = ptyIdRef.current;
      if (!t || !pty || t.buffer.active.type !== 'alternate') return;
      e.preventDefault();
      const n = Math.max(1, Math.min(6, Math.round(Math.abs(e.deltaY) / 40)));
      window.api.pty.write(pty, (e.deltaY < 0 ? '\x1b[A' : '\x1b[B').repeat(n));
    };
    containerEl.addEventListener('wheel', onWheel, { passive: false, capture: true });

    term.onData((data) => {
      const myPty = ptyIdRef.current;
      if (!myPty) return;
      window.api.pty.write(myPty, data);
      // Broadcast: espelha a entrada para os outros terminais da MESMA aba.
      // Lê estado fresco do store (este listener é registrado uma única vez).
      // pty.write não dispara onData nos destinos, então não há eco/loop.
      const ws = useWorkspaceStore.getState();
      const tab = ws.tabs.find((t) => t.id === tabId);
      if (!tab?.broadcast) return;
      for (const leaf of collectLeaves(tab.root)) {
        if (leaf.terminalId && leaf.terminalId !== myPty) {
          window.api.pty.write(leaf.terminalId, data);
        }
      }
    });

    // Smart key handling: copy/paste with selection-aware Ctrl+C
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') return true;
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;

      // Shift+Enter → quebra de linha no input (multi-linha) em vez de enviar.
      // Envia LF; programas com line-editing (Claude Code, PSReadLine) inserem
      // nova linha, enquanto o Enter puro (CR) submete.
      if (key === 'enter' && event.shiftKey && !ctrl && !event.altKey) {
        if (ptyIdRef.current) window.api.pty.write(ptyIdRef.current, '\n');
        return false;
      }
      // Ctrl+F → busca no scrollback do terminal.
      if (ctrl && !event.shiftKey && key === 'f') {
        setSearchOpen(true);
        return false;
      }

      // Global app shortcuts — let them bubble up, don't send as control chars.
      if (ctrl && (
        (key === 'k' && !event.shiftKey) ||
        key === 'p' || // Ctrl+P (quick open) and Ctrl+Shift+P (palette)
        (key === 't' && !event.shiftKey) ||
        key === ',' ||
        (event.shiftKey && (key === '\\' || key === '_'))
      )) {
        return false;
      }
      // Ctrl+V: suprime o control char (\x16) e deixa o evento 'paste' nativo
      // colar o TEXTO (1x). Imagem é tratada no listener de 'paste'.
      if (ctrl && key === 'v') return false;
      // Ctrl+Shift+C → explicit copy (works even without selection: copies all visible)
      if (ctrl && event.shiftKey && key === 'c') {
        void copySelection({ explicit: true });
        return false;
      }
      // Ctrl+C → copy if selection, otherwise pass through (SIGINT)
      if (ctrl && !event.shiftKey && key === 'c') {
        if (term.hasSelection()) {
          void copySelection({ explicit: false });
          return false;
        }
        return true;
      }
      // Ctrl+A passa direto para o shell: no PSReadLine (PowerShell) seleciona
      // a linha que você digitou; em outros programas faz o que eles definirem.
      // Para copiar o terminal inteiro, use Ctrl+Shift+C (copia tudo visível).
      return true;
    });

    // Coalesce múltiplos eventos de resize (ex.: arrastar o divisor do split) em
    // um único fit por frame — terminal fluido, sem jank nem resize em rajada.
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      if (roRaf) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        // Só redimensiona o PTY se o fit realmente aconteceu (terminal visível).
        if (safeFit(containerEl, fit) && ptyIdRef.current) {
          try { window.api.pty.resize(ptyIdRef.current, term.cols, term.rows); }
          catch { /* ignore */ }
        }
      });
    });
    ro.observe(containerEl);

    // Paste: o xterm cola TEXTO nativamente (1x). Só interceptamos IMAGEM:
    // salvamos num arquivo e colamos o caminho (com miniatura de confirmação).
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const hasImage = !!items && Array.from(items).some((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        void pasteFromClipboard();
      }
    };
    containerEl.addEventListener('paste', onPaste, true);

    return () => {
      if (roRaf) cancelAnimationFrame(roRaf);
      ro.disconnect();
      containerEl.removeEventListener('wheel', onWheel, true);
      containerEl.removeEventListener('paste', onPaste, true);
      offDataRef.current?.();
      offExitRef.current?.();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = settings.fontSize;
    term.options.fontFamily = settings.terminalFontFamily || DEFAULT_TERM_FONT;
    term.options.cursorStyle = settings.terminalCursorStyle;
    term.options.cursorBlink = settings.terminalCursorBlink;
    safeFit(containerRef.current, fitRef.current);
  }, [settings.fontSize, settings.terminalFontFamily, settings.terminalCursorStyle, settings.terminalCursorBlink]);

  // Apply terminal theme: per-pane override beats global setting.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const themeId = pane.terminalTheme ?? settings.terminalTheme;
    const t = getTerminalTheme(themeId).theme;
    term.options.theme = { ...t, background: 'rgba(0,0,0,0)', selectionBackground: SELECTION_BG };
    setChatColors(chatColumnColors(t.background ?? '#1a1815'));
  }, [pane.terminalTheme, settings.terminalTheme]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !pane.projectPath) return;

    // Helper: attach data/exit listeners for a given ptyId. `t` is passed
    // explicitly so TypeScript keeps the non-null narrowing inside the async
    // callbacks below.
    function attachListeners(ptyId: string, t: Terminal) {
      const cleanupData = window.api.pty.onData((id, data) => {
        if (id !== ptyId) return;
        t.write(data);
        // Detecta o modelo anunciado no banner (acumula um rabo do output para
        // tolerar o banner chegar partido em vários chunks). É só um "palpite"
        // imediato — o transcript confirma o modelo real logo em seguida.
        const plain = data.replace(ANSI_RE, '');
        modelBufRef.current = (modelBufRef.current + plain).slice(-600);
        // Skill em uso (best-effort) — mostra um chip no header enquanto roda.
        const sk = CLAUDE_SKILL_RE.exec(modelBufRef.current);
        if (sk) useClaudeStatusStore.getState().setSkill(pane.id, sk[1]);
        const mm = CLAUDE_MODEL_RE.exec(modelBufRef.current);
        if (mm) {
          modelBaseRef.current = `${mm[1]} ${mm[2]}`;
          modelEffortRef.current = mm[3] ? mm[3].toLowerCase() : modelEffortRef.current;
          composeModel();
        }
        // Dev server rodado direto no terminal (à mão / pelo Claude): detecta a
        // primeira URL local com porta e abre o Browser. Servers iniciados pelo
        // botão Dev já são tratados no devServers store.
        if (autoOpenRef.current && pane.projectPath) {
          const um = DEV_URL_RE.exec(plain);
          if (um && /:\d+/.test(um[0])) {
            const url = um[0].replace('0.0.0.0', 'localhost').replace(/[).,'"]+$/, '');
            if (url !== devUrlOpenedRef.current) {
              devUrlOpenedRef.current = url;
              useWorkspaceStore.getState().openDevBrowser(
                pane.projectName ?? projectNameRef.current ?? 'Dev', pane.projectPath, url,
              );
            }
          }
        }
        // Claude parou pedindo confirmação? marca 'approval' (precisa de você).
        if (CLAUDE_APPROVAL_RE.test(modelBufRef.current)) {
          awaitingApprovalRef.current = true;
          useClaudeStatusStore.getState().setStatus(pane.id, 'approval');
        }
        if (CLAUDE_ACTIVITY_RE.test(data)) {
          awaitingApprovalRef.current = false; // voltou a produzir
          setClaudeRunning(true);
          claudeActiveRef.current = true;
          useClaudeStatusStore.getState().setStatus(pane.id, 'running');
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(onClaudeIdle, CLAUDE_IDLE_MS);
        }
      });
      const cleanupExit = window.api.pty.onExit((id) => {
        if (id !== ptyId) return;
        t.write('\r\n\x1b[2;38;5;240m[processo encerrado]\x1b[0m\r\n');
        if (ptyIdRef.current === ptyId) {
          ptyIdRef.current = null;
          setClaudeRunning(false);
          useClaudeStatusStore.getState().clear(pane.id);
        }
      });
      offDataRef.current = cleanupData;
      offExitRef.current = cleanupExit;
    }

    if (pane.terminalId) {
      // Reconnect to an existing PTY (e.g. after a split reorganizes the React tree)
      ptyIdRef.current = pane.terminalId;
      attachListeners(pane.terminalId, term);
      // Trigger resize so the shell redraws its prompt
      setTimeout(() => {
        if (safeFit(containerRef.current, fitRef.current) && ptyIdRef.current && termRef.current) {
          window.api.pty.resize(ptyIdRef.current, termRef.current.cols, termRef.current.rows);
        }
      }, 50);
      return;
    }

    // Painel que nasce como Navegador (slot → Navegador) não precisa de um shell
    // rodando escondido — e criar o PTY dispara updatePane/foco que rouba a
    // digitação da barra de endereço do browser. Só cria o terminal de fato.
    if (pane.viewMode === 'browser') return;

    // Create a brand-new PTY
    const ptyId = newId('pty');
    ptyIdRef.current = ptyId;
    attachListeners(ptyId, term);

    window.api.pty.create({
      id: ptyId,
      cwd: pane.projectPath,
      shell: settings.defaultShell,
      cols: term.cols,
      rows: term.rows,
      // VOLTZ_TERMINAL_TOKEN: identidade deste terminal para o MCP do navegador
      // (isolamento por aba). CLAUDE_CONFIG_DIR: conta escolhida (principal = sem).
      env: {
        VOLTZ_TERMINAL_TOKEN: agentTokenRef.current,
        ...(envConfigDirRef.current ? { CLAUDE_CONFIG_DIR: envConfigDirRef.current } : {}),
      },
    }).then((res) => {
      if (!res.ok) {
        term.write(`\r\n\x1b[31mErro ao iniciar terminal: ${res.error}\x1b[0m\r\n`);
        return;
      }
      updatePane(tabId, pane.id, { terminalId: ptyId });
      // Retoma a sessão do Claude pedida ao abrir (consumido uma única vez).
      if (pane.resumeSessionId) {
        const sid = pane.resumeSessionId;
        updatePane(tabId, pane.id, { resumeSessionId: undefined });
        // Pequeno atraso para o shell terminar de inicializar antes do comando.
        setTimeout(() => { void resumeSession(sid); }, 800);
      } else if (pane.autoStartClaude) {
        // Usado pelo fluxo de login de conta: abre o Claude (que pede login).
        updatePane(tabId, pane.id, { autoStartClaude: undefined });
        setTimeout(() => { void startClaude(); }, 800);
      } else if (pane.autoRunCommand) {
        // Inicia um agente arbitrário (codex, gemini, qwen…) ao subir o terminal.
        const runCmd = pane.autoRunCommand;
        updatePane(tabId, pane.id, { autoRunCommand: undefined });
        setTimeout(() => { window.api.pty.write(ptyId, `${runCmd}\r`); setClaudeRunning(true); }, 800);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.projectPath]);

  async function copySelection({ explicit }: { explicit: boolean }) {
    const term = termRef.current;
    if (!term) return;
    let text = term.getSelection();
    // With Ctrl+Shift+C and no selection, grab the whole scrollback as a courtesy.
    if (!text && explicit) {
      const prev = term.getSelectionPosition();
      term.selectAll();
      text = term.getSelection();
      if (!prev) term.clearSelection();
    }
    if (!text) {
      if (explicit) toast.warning('Nada selecionado', 'Selecione com o mouse e tente de novo.');
      return;
    }
    try {
      await window.api.clipboard.writeText(text);
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
      toast.success('Copiado', preview);
      if (!explicit) term.clearSelection();
    } catch (err) {
      toast.error('Falha ao copiar', (err as Error).message);
    }
  }

  async function pasteFromClipboard() {
    if (!ptyIdRef.current) return;
    // Try image first (clipboard.getImage via main process)
    try {
      const img = await window.api.clipboard.getImage();
      if (img) {
        const filePath = await window.api.clipboard.saveImage(img.png, 'png');
        window.api.pty.write(ptyIdRef.current, filePath);
        showPastedImage({ path: filePath, dataUrl: `data:image/png;base64,${img.png}` });
        return;
      }
    } catch { /* no image */ }
    // Text — prefer native Electron clipboard (renderer's navigator.clipboard
    // silently fails when the window isn't focused).
    try {
      const text = await window.api.clipboard.readText();
      if (text) window.api.pty.write(ptyIdRef.current, text);
    } catch { /* ignore */ }
  }

  // Arquivo(s)/pasta(s) arrastados do Explorer → insere o caminho absoluto no
  // terminal (com aspas se tiver espaço). O Claude Code então lê/interpreta o
  // que foi solto. Funciona com arquivos e diretórios.
  function handleFileDrop(files: FileList) {
    if (!ptyIdRef.current) {
      toast.info('Abra um projeto neste terminal antes de soltar arquivos.');
      return;
    }
    // Electron expõe o caminho absoluto do item nativo em File.path.
    // (No Electron 32+ isto migraria para webUtils.getPathForFile.)
    const paths = Array.from(files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    if (!paths.length) return;
    const text = paths.map(quoteForDrop).join(' ') + ' ';
    window.api.pty.write(ptyIdRef.current, text);
    termRef.current?.focus();
    toast.success(
      paths.length > 1 ? `${paths.length} caminhos inseridos` : 'Caminho inserido',
      paths.length > 1 ? undefined : paths[0],
    );
  }

  async function toggleSpeech() {
    const term = termRef.current;
    // Stop recording — flush to Whisper
    if (recording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      return;
    }

    if (!settings.whisperApiKey) {
      term?.write('\r\n\x1b[33m[Voltz IDE] Configure uma API key do Whisper em Configurações (free no Groq).\x1b[0m\r\n');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      term?.write(`\r\n\x1b[31m[Voltz IDE] Microfone bloqueado: ${(e as Error).message}\x1b[0m\r\n`);
      return;
    }
    audioStreamRef.current = stream;

    // Pick a supported mime type
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mime = candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    audioChunksRef.current = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecording(false);

      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      audioChunksRef.current = [];
      if (blob.size === 0) return;

      setTranscribing(true);
      try {
        const buf = await blob.arrayBuffer();
        const base64 = bufferToBase64(buf);
        const result = await window.api.transcribe.audio(base64, blob.type, {
          apiKey: settings.whisperApiKey!,
          apiBase: settings.whisperApiBase,
          model: settings.whisperModel,
          language: 'pt',
        });
        if (result.ok) {
          if (result.text && ptyIdRef.current) {
            window.api.pty.write(ptyIdRef.current, result.text + ' ');
          }
        } else {
          term?.write(`\r\n\x1b[31m[Voltz IDE] Erro na transcrição: ${result.error}\x1b[0m\r\n`);
        }
      } catch (err) {
        term?.write(`\r\n\x1b[31m[Voltz IDE] Falha: ${(err as Error).message}\x1b[0m\r\n`);
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    setRecording(true);
  }

  async function startClaude() {
    const term = termRef.current;
    const ptyId = ptyIdRef.current;
    if (!ptyId) {
      term?.write('\r\n\x1b[33m[Voltz IDE] Terminal ainda não iniciado\x1b[0m\r\n');
      return;
    }

    // Garante a memória do projeto (CLAUDE.md + AGENTS.md) para o agente ter contexto.
    if (pane.projectPath) {
      void window.api.projectMemory.ensure(pane.projectPath, pane.projectName ?? '')
        .then((r) => { if (r.created.length) toast.success('Contexto do projeto criado', r.created.join(' + ')); })
        .catch(() => {});
    }

    let claudePath = settings.claudePath;

    if (!claudePath) {
      const result = await window.api.claude.detect();
      if (!result.path) {
        term?.write('\r\n\x1b[31m[Voltz IDE] Claude CLI não encontrado. Configure o caminho em Configurações.\x1b[0m\r\n');
        return;
      }
      claudePath = result.path;
      void useSettingsStore.getState().update({ claudePath: result.path });
    }

    const isPs = settings.defaultShell === 'pwsh';
    const cmd = isPs ? `& "${claudePath}"` : `"${claudePath}"`;
    window.api.pty.write(ptyId, `${cmd}\r`);
    setClaudeRunning(true);
  }

  async function resumeClaude() {
    const term = termRef.current;
    const ptyId = ptyIdRef.current;
    if (!ptyId) return;

    let claudePath = settings.claudePath;
    if (!claudePath) {
      const result = await window.api.claude.detect();
      if (!result.path) {
        term?.write('\r\n\x1b[31m[Voltz IDE] Claude CLI não encontrado.\x1b[0m\r\n');
        return;
      }
      claudePath = result.path;
      void useSettingsStore.getState().update({ claudePath: result.path });
    }

    const isPs = settings.defaultShell === 'pwsh';
    // claude --continue resumes the last session in cwd
    const cmd = isPs ? `& "${claudePath}" --continue` : `"${claudePath}" --continue`;
    window.api.pty.write(ptyId, `${cmd}\r`);
    setClaudeRunning(true);
  }

  async function resumeSession(sessionId: string, sessionConfigDir?: string) {
    const term = termRef.current;
    const ptyId = ptyIdRef.current;
    if (!ptyId) return;

    let claudePath = settings.claudePath;
    if (!claudePath) {
      const result = await window.api.claude.detect();
      if (!result.path) {
        term?.write('\r\n\x1b[31m[Voltz IDE] Claude CLI não encontrado.\x1b[0m\r\n');
        return;
      }
      claudePath = result.path;
      void useSettingsStore.getState().update({ claudePath: result.path });
    }

    // A sessão pode pertencer a OUTRA conta (CLAUDE_CONFIG_DIR diferente). Aponta o
    // terminal pra conta dona ANTES do --resume, senão dá "No conversation found".
    if (sessionConfigDir) {
      const norm = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
      const owner = useAccountsStore.getState().accounts.find((a) => norm(a.dir) === norm(sessionConfigDir));
      if (owner) {
        if (owner.id !== pane.claudeAccountId) setClaudeAccount(owner.id);
      } else {
        // Conta fora do gerenciador: aponta o env direto pra ela.
        const shell = settings.defaultShell;
        const envCmd = shell === 'cmd'
          ? `set "CLAUDE_CONFIG_DIR=${sessionConfigDir}"`
          : shell === 'pwsh'
            ? `$env:CLAUDE_CONFIG_DIR='${sessionConfigDir}'`
            : `export CLAUDE_CONFIG_DIR="${sessionConfigDir}"`;
        window.api.pty.write(ptyId, `${envCmd}\r`);
      }
    }

    const isPs = settings.defaultShell === 'pwsh';
    const cmd = isPs ? `& "${claudePath}" --resume ${sessionId}` : `"${claudePath}" --resume ${sessionId}`;
    window.api.pty.write(ptyId, `${cmd}\r`);
    setClaudeRunning(true);
  }

  function setClaudeAccount(accountId: string) {
    updatePane(tabId, pane.id, { claudeAccountId: accountId });
    const envDir = useAccountsStore.getState().envConfigDirFor(accountId);
    const ptyId = ptyIdRef.current;
    if (ptyId) {
      const shell = settings.defaultShell;
      let cmd: string;
      if (envDir) {
        cmd = shell === 'cmd'
          ? `set "CLAUDE_CONFIG_DIR=${envDir}"`
          : shell === 'pwsh'
            ? `$env:CLAUDE_CONFIG_DIR='${envDir}'`
            : `export CLAUDE_CONFIG_DIR="${envDir}"`;
      } else {
        // Conta principal: remove a variável → claude volta ao default nativo.
        cmd = shell === 'cmd'
          ? `set "CLAUDE_CONFIG_DIR="`
          : shell === 'pwsh'
            ? `Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue`
            : `unset CLAUDE_CONFIG_DIR`;
      }
      window.api.pty.write(ptyId, `${cmd}\r`);
    }
    // Reavalia o modelo pela conta nova.
    setTimeout(() => refreshModelFromTranscript(), 200);
  }

  // Drag-and-drop de reordenação: o header age como "alça"; o painel inteiro
  // (via overlay durante o arraste) é a zona de soltar.
  const dragHandleProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', pane.id);
      setDraggingPane(pane.id);
    },
    onDragEnd: () => { setDraggingPane(null); setDropOver(false); },
  };
  const isSelfDragging = draggingPaneId === pane.id;
  const isOtherDragging = !!draggingPaneId && !isSelfDragging;

  return (
    <div
      className="pane-fadein relative h-full w-full p-1.5"
      style={isSelfDragging ? { opacity: 0.35 } : undefined}
      onMouseDownCapture={() => { setActivePane(tabId, pane.id); if (viewMode === 'terminal') termRef.current?.focus(); }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-md"
        style={{
          borderLeft: `3px solid ${accent}`,
          // Anel âmbar inequívoco: tudo que você digita aqui vai para os outros.
          ...(broadcastActive ? { boxShadow: '0 0 0 2px var(--bg-surface), 0 0 0 4px #f59e0b' } : null),
        }}
      >
      {/* No modo browser o painel tem header próprio (abas) — esconde a do terminal. */}
      {viewMode === 'terminal' && (
        <PaneHeader
          tabId={tabId}
          pane={pane}
          onStartClaude={startClaude}
          onResumeClaude={resumeClaude}
          onResumeSession={resumeSession}
          onToggleSpeech={toggleSpeech}
          onClearTerminal={() => termRef.current?.clear()}
          hasTerminal={!!ptyIdRef.current}
          claudeRunning={claudeRunning}
          claudeModel={claudeModel}
          accountId={pane.claudeAccountId}
          onSetAccount={setClaudeAccount}
          recording={recording}
          viewMode={viewMode}
          onOpenBrowser={openBrowser}
          dragHandleProps={canvasMode ? undefined : dragHandleProps}
        />
      )}

      {/* Browser surface — kept alive so the page state survives toggling.
          Renderiza também sem projeto (slot vazio → Navegador), senão fica só o fundo. */}
      {(pane.projectPath || viewMode === 'browser') && (
        <div className="flex-1 overflow-hidden" style={{ display: viewMode === 'browser' ? 'block' : 'none' }}>
          <BrowserPane
            paneId={pane.id}
            tabId={tabId}
            projectPath={pane.projectPath ?? ''}
            projectName={pane.projectName ?? undefined}
            accentColor={accent}
            initialUrl={pane.browserUrl}
            visible={isTabActive && viewMode === 'browser'}
            onUrlChange={(url) => updatePane(tabId, pane.id, { browserUrl: url })}
            onClose={() => useWorkspaceStore.getState().closePane(tabId, pane.id)}
            dragHandleProps={dragHandleProps}
          />
        </div>
      )}

      {/* Terminal container — tonal margin + centred reading column */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: chatColors.margin, display: viewMode === 'terminal' ? 'block' : 'none' }}
        onDragOver={(e) => {
          // Só reage a arquivos do SO — não interfere no drag de reordenar painel.
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!fileDragOver) setFileDragOver(true);
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDragOver(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          setFileDragOver(false);
          handleFileDrop(e.dataTransfer.files);
        }}
      >
        {!pane.projectPath && (
          <EmptyState
            tabId={tabId}
            paneId={pane.id}
            projects={projects}
            openProjectInPane={openProjectInPane}
          />
        )}
        {broadcastActive && (
          <div
            className="pointer-events-none absolute right-2.5 top-2 z-30 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 16%, var(--bg-surface))' }}
            title="Entrada sincronizada: o que você digita aqui vai para todos os terminais desta aba."
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#f59e0b' }} />
            Broadcast
          </div>
        )}
        {fileDragOver && (
          <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-strong bg-accent-soft/40 backdrop-blur-sm">
            <span className="flex items-center gap-2 rounded-lg bg-bg-overlay px-3.5 py-2 text-[13px] font-semibold text-accent shadow-lg">
              <Paperclip size={15} /> Soltar para inserir o caminho no terminal
            </span>
          </div>
        )}
        {searchOpen && (
          <TerminalSearch
            searchRef={searchRef}
            onClose={() => {
              try { searchRef.current?.clearDecorations(); } catch { /* ignore */ }
              termRef.current?.clearSelection();
              setSearchOpen(false);
              termRef.current?.focus();
            }}
          />
        )}
        {/* Full-width column: paints the terminal background and adds inner
            padding (the xterm itself is transparent, so this colour shows). */}
        <div
          className="relative h-full w-full"
          style={{
            background: chatColors.column,
            padding: '12px 18px 8px',
          }}
        >
          <div
            ref={containerRef}
            className="h-full w-full"
            onContextMenu={(e) => {
              e.preventDefault();
              if (termRef.current?.hasSelection()) {
                void copySelection({ explicit: false });
              } else {
                void pasteFromClipboard();
              }
            }}
          />
        </div>

        {pastedImage && (
          <div
            key={pastedImage.path}
            className="group pointer-events-auto absolute bottom-3 right-3 z-30 flex flex-col overflow-hidden rounded-xl border border-accent-strong bg-bg-overlay/95 shadow-lg backdrop-blur"
            title={pastedImage.path}
          >
            <div className="relative">
              <img
                src={pastedImage.dataUrl}
                alt="paste"
                className="block"
                style={{ height: 160, width: 'auto', maxWidth: 280, objectFit: 'contain' }}
              />
              <button
                onClick={dismissPastedImage}
                className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                title="Dispensar"
              >
                <XIcon size={11} />
              </button>
            </div>
            <div className="h-[3px] w-full bg-bg-active">
              <div className="paste-progress h-full w-full bg-accent" />
            </div>
          </div>
        )}

        {(recording || transcribing) && (
          <div
            className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1 shadow-md backdrop-blur"
            style={{
              background: recording ? 'color-mix(in srgb, var(--danger) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)',
              borderColor: recording ? 'var(--danger)' : 'var(--accent)',
            }}
          >
            <span
              className="claude-dot h-1.5 w-1.5 rounded-full"
              style={{ background: recording ? 'var(--danger)' : 'var(--accent)' }}
            />
            <span
              className="text-[10px] font-semibold"
              style={{ color: recording ? 'var(--danger)' : 'var(--accent)' }}
            >
              {recording ? 'Gravando — clique no mic para parar' : 'Transcrevendo…'}
            </span>
          </div>
        )}
      </div>

      {!canvasMode && pane.projectPath && viewMode === 'terminal' && (
        <div className="flex items-center gap-2 border-t border-border-subtle bg-bg-base/30 px-3 py-1.5 text-[10.5px] text-text-muted">
          <span
            className="rounded px-1.5 py-px text-[9.5px] font-semibold tracking-wide"
            style={{
              background: 'var(--bg-active)',
              color: color?.text ?? 'var(--text-tertiary)',
            }}
          >
            {settings.defaultShell.toUpperCase()}
          </span>
          <span className="truncate" title={pane.projectPath}>{pane.projectPath}</span>
        </div>
      )}
      </div>

      {/* Zona de soltar (reordenação). Fica por cima do conteúdo durante o
          arraste para capturar o drag mesmo sobre o webview/terminal. */}
      {!canvasMode && isOtherDragging && (
        <div
          className="absolute inset-1.5 z-40 flex items-center justify-center rounded-xl transition-colors"
          style={{
            background: dropOver ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'color-mix(in srgb, var(--bg-base) 10%, transparent)',
            border: dropOver ? '2px dashed var(--accent)' : '2px dashed transparent',
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!dropOver) setDropOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            const src = e.dataTransfer.getData('text/plain') || draggingPaneId;
            if (src && src !== pane.id) swapPanes(tabId, src, pane.id);
            setDropOver(false);
            setDraggingPane(null);
          }}
        >
          {dropOver && (
            <span className="pointer-events-none flex items-center gap-1.5 rounded-lg bg-bg-overlay px-3 py-1.5 text-[12px] font-semibold text-accent shadow-lg">
              <ArrowLeftRight size={13} /> Trocar posição
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Barra de busca no scrollback do terminal (Ctrl+F). Enter = próximo, Shift+Enter = anterior. */
function TerminalSearch({ searchRef, onClose }: { searchRef: React.RefObject<SearchAddon | null>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const opts = {
    decorations: {
      matchBackground: 'rgba(139,124,255,0.30)',
      activeMatchBackground: 'rgba(139,124,255,0.65)',
      matchOverviewRuler: '#8b7cff',
      activeMatchColorOverviewRuler: '#8b7cff',
    },
  };
  function find(dir: 'next' | 'prev', query = q) {
    const s = searchRef.current;
    if (!s || !query) return;
    if (dir === 'next') s.findNext(query, opts); else s.findPrevious(query, opts);
  }

  return (
    <div className="absolute right-2.5 top-2.5 z-40 flex items-center gap-1 rounded-lg border border-border-default bg-bg-overlay px-2 py-1 shadow-lg">
      <Search size={12} className="shrink-0 text-text-muted" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (v) find('next', v);
          else { try { searchRef.current?.clearDecorations(); } catch { /* ignore */ } }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey ? 'prev' : 'next'); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
        placeholder="Buscar no terminal…"
        className="w-44 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
        spellCheck={false}
      />
      <button onClick={() => find('prev')} title="Anterior (Shift+Enter)" className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
        <ChevronUp size={14} />
      </button>
      <button onClick={() => find('next')} title="Próximo (Enter)" className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
        <ChevronDown size={14} />
      </button>
      <button onClick={onClose} title="Fechar (Esc)" className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
        <XIcon size={13} />
      </button>
    </div>
  );
}

function EmptyState({ tabId, paneId, projects, openProjectInPane }: {
  tabId: string;
  paneId: string;
  projects: { id: string; name: string; path: string }[];
  openProjectInPane: (tabId: string, paneId: string, name: string, path: string) => void;
}) {
  const [search, setSearch] = useState('');
  const customs = useProjectCustomStore((s) => s.customs);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const scan = useProjectsStore((s) => s.scan);

  const q = search.trim().toLowerCase();
  const matches = (p: { name: string; path: string }) => {
    if (!q) return true;
    const alias = selectCustom(customs, p.path).alias ?? '';
    return p.name.toLowerCase().includes(q) || alias.toLowerCase().includes(q);
  };

  const favorites = projects.filter((p) => selectCustom(customs, p.path).favorite && matches(p));
  const others = projects.filter((p) => !selectCustom(customs, p.path).favorite && matches(p)).slice(0, 12);
  const recents = settings.recentProjects.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
  );

  function baseName(p: string) {
    return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  }

  // Insere/promove uma pasta no topo dos recentes (dedup por path, teto de 8).
  function pushRecent(path: string, name: string) {
    const rest = settings.recentProjects.filter((r) => r.path !== path);
    void update({ recentProjects: [{ path, name }, ...rest].slice(0, 8) });
  }

  // Adiciona uma nova pasta raiz (mantém as existentes) e re-escaneia.
  async function addRoot() {
    const folder = await window.api.dialog.pickFolder();
    if (!folder) return;
    const next = settings.rootFolders.includes(folder)
      ? settings.rootFolders
      : [...settings.rootFolders, folder];
    if (next !== settings.rootFolders) await update({ rootFolders: next });
    await scan(next);
  }

  // Abre uma pasta avulsa direto no painel (não vira raiz) e guarda nos recentes.
  async function openFolder() {
    const folder = await window.api.dialog.pickFolder();
    if (!folder) return;
    const name = baseName(folder);
    openProjectInPane(tabId, paneId, name, folder);
    pushRecent(folder, name);
  }

  function openRecent(r: RecentProject) {
    openProjectInPane(tabId, paneId, r.name, r.path);
    pushRecent(r.path, r.name);
  }

  function removeRecent(path: string) {
    void update({ recentProjects: settings.recentProjects.filter((r) => r.path !== path) });
  }

  function ProjectRow({ p, fav }: { p: { id: string; name: string; path: string }; fav: boolean }) {
    const custom = selectCustom(customs, p.path);
    const auto = getProjectColor(p.name);
    const name = custom.alias || p.name;
    return (
      <button
        onClick={() => openProjectInPane(tabId, paneId, p.name, p.path)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-hover"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
          style={{ background: custom.color ?? auto.badge }}
        >
          {custom.emoji || name[0].toUpperCase()}
        </span>
        <span className="flex-1 truncate" style={{ color: custom.color ?? auto.text }}>{name}</span>
        {fav && <Star size={11} fill="currentColor" className="shrink-0 text-warning" />}
      </button>
    );
  }

  function RecentRow({ r }: { r: RecentProject }) {
    return (
      <div className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-bg-hover">
        <button
          onClick={() => openRecent(r)}
          title={r.path}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-bg-hover text-text-muted">
            <FolderOpen size={11} />
          </span>
          <span className="flex-1 truncate text-text-secondary">{r.name}</span>
        </button>
        <button
          onClick={() => removeRecent(r.path)}
          title="Remover dos recentes"
          aria-label="Remover dos recentes"
          className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        >
          <XIcon size={11} />
        </button>
      </div>
    );
  }

  function FavCard({ p }: { p: { id: string; name: string; path: string } }) {
    const custom = selectCustom(customs, p.path);
    const auto = getProjectColor(p.name);
    const color = custom.color ?? auto.border;
    const name = custom.alias || p.name;
    const folder = p.path.split(/[\\/]/).filter(Boolean).pop() ?? p.path;
    return (
      <button
        onClick={() => openProjectInPane(tabId, paneId, p.name, p.path)}
        title={p.path}
        className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-transform duration-150 hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 16%, var(--bg-surface)) 0%, var(--bg-surface) 72%)`,
          borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 60%, transparent)`;
          e.currentTarget.style.boxShadow = `0 10px 28px -8px color-mix(in srgb, ${color} 45%, transparent)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 30%, transparent)`;
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* leve brilho radial na cor, no canto */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
          style={{ background: color }}
        />
        <Star
          size={13}
          className="absolute right-3 top-3 transition-transform group-hover:scale-110"
          style={{ color: 'var(--warning)' }}
          fill="currentColor"
        />
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
          style={{ background: color, boxShadow: `0 4px 12px -2px color-mix(in srgb, ${color} 55%, transparent)` }}
        >
          {custom.emoji || name[0].toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: custom.color ?? auto.text }}>
            {name}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-text-muted">
            <FolderOpen size={9} className="shrink-0 opacity-70" />
            <span className="truncate">{folder}</span>
          </div>
        </div>
      </button>
    );
  }

  const hasContent = projects.length > 0 || settings.recentProjects.length > 0;
  const wide = favorites.length > 0;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg-base p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="mb-1 rounded-xl p-3" style={{ background: 'var(--accent-soft)' }}>
          <FolderOpen size={24} className="text-accent" />
        </div>
        <p className="text-sm font-semibold text-text-secondary">Escolha um projeto</p>
        <p className="text-xs text-text-tertiary">ou clique num da sidebar</p>
      </div>

      {hasContent && (
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-xs'}`}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto…"
            className="mb-2.5 w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
          />
          <div className="overflow-y-auto pr-1" style={{ maxHeight: 340 }}>
            {recents.length > 0 && (
              <div className="mb-4">
                <div className="mb-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                  Recentes
                </div>
                <div className="flex flex-col gap-1">
                  {recents.map((r) => <RecentRow key={r.path} r={r} />)}
                </div>
              </div>
            )}
            {favorites.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <Star size={10} className="text-warning" fill="currentColor" /> Favoritos
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {favorites.map((p) => <FavCard key={p.id} p={p} />)}
                </div>
              </div>
            )}
            {others.length > 0 && (
              <div className="flex flex-col gap-1">
                {(favorites.length > 0 || recents.length > 0) && (
                  <div className="mb-0.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                    Todos os projetos
                  </div>
                )}
                {others.map((p) => <ProjectRow key={p.id} p={p} fav={false} />)}
              </div>
            )}
            {favorites.length === 0 && others.length === 0 && recents.length === 0 && (
              <div className="px-2 py-6 text-center text-[11px] text-text-muted">Nenhum projeto encontrado</div>
            )}
          </div>
        </div>
      )}

      <div className={`flex w-full flex-wrap items-center justify-center gap-2 ${wide ? 'max-w-xl' : 'max-w-xs'}`}>
        <button
          onClick={addRoot}
          title="Cadastra uma pasta cujas subpastas viram projetos no seletor"
          className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <FolderPlus size={13} /> Adicionar pasta raiz
        </button>
        <button
          onClick={openFolder}
          title="Abre uma pasta avulsa neste painel, sem cadastrá-la como raiz"
          className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <FolderOpen size={13} /> Abrir pasta…
        </button>
      </div>
    </div>
  );
}

