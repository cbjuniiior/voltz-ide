import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, X as XIcon,
  ExternalLink, Globe, Play, Loader2, Square,
  Zap, Bug, Eraser, Plus, Lock, Search, Smartphone, Monitor,
  ZoomIn, ZoomOut, Camera, SquareTerminal, RotateCcw, ChevronDown,
  Trash2, AlertTriangle,
} from 'lucide-react';
import { useDevServersStore, selectDevServer } from '@/stores/devServers';
import { useSettingsStore } from '@/stores/settings';
import { newId } from '@/lib/layoutTree';
import { toast } from '@/stores/toasts';

// Subset of Electron's WebviewTag we use.
interface WebviewEl extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  reloadIgnoringCache(): void;
  stop(): void;
  openDevTools(): void;
  closeDevTools(): void;
  isDevToolsOpened(): boolean;
  setUserAgent(userAgent: string): void;
  getUserAgent(): string;
  setZoomLevel(level: number): void;
  capturePage(): Promise<{ toDataURL(): string }>;
  getWebContentsId(): number;
}

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

interface Device { id: string; label: string; w: number; h: number; dpr: number; ua: string | null; }
const DEVICES: Device[] = [
  { id: 'responsive', label: 'Responsivo', w: 0, h: 0, dpr: 1, ua: null },
  { id: 'iphone-se', label: 'iPhone SE', w: 375, h: 667, dpr: 2, ua: UA_IOS },
  { id: 'iphone-15', label: 'iPhone 15 Pro', w: 393, h: 852, dpr: 3, ua: UA_IOS },
  { id: 'pixel-7', label: 'Pixel 7', w: 412, h: 915, dpr: 2.6, ua: UA_ANDROID },
  { id: 'galaxy-s20', label: 'Galaxy S20', w: 360, h: 800, dpr: 3, ua: UA_ANDROID },
  { id: 'ipad-air', label: 'iPad Air', w: 820, h: 1180, dpr: 2, ua: UA_IPAD },
  { id: 'ipad-pro', label: 'iPad Pro 12.9″', w: 1024, h: 1366, dpr: 2, ua: UA_IPAD },
];

interface BrowserTab { id: string; url: string; title: string; favicon: string | null; }
interface ConsoleMsg { id: number; level: number; text: string; source: string; line: number; }

interface Props {
  paneId: string;
  projectPath: string;
  projectName?: string;
  accentColor?: string;
  initialUrl?: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
  onClose?: () => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
}

function normaliseUrl(input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^localhost(:\d+)?/i.test(v) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(v)) return `http://${v}`;
  if (/^[\w-]+\.[\w.-]+/.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

function tabLabel(tab: BrowserTab): string {
  if (tab.title) return tab.title;
  if (!tab.url) return 'Nova aba';
  try {
    const u = new URL(tab.url);
    return u.host + (u.pathname !== '/' ? u.pathname : '');
  } catch { return tab.url; }
}

export function BrowserPane({
  paneId, projectPath, projectName, accentColor, initialUrl, visible, onUrlChange, onClose, dragHandleProps,
}: Props) {
  void paneId;
  const webviewRef = useRef<WebviewEl | null>(null);
  const readyRef = useRef(false);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const defaultUaRef = useRef<string>('');
  const consoleIdRef = useRef(0);
  const wcIdRef = useRef<number | null>(null); // webContentsId do webview ativo (rotear popups)

  const [tabs, setTabs] = useState<BrowserTab[]>(() => [
    { id: newId('tab'), url: initialUrl ?? '', title: '', favicon: null },
  ]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const [address, setAddress] = useState(active.url);
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [crashed, setCrashed] = useState(false);

  // Emulador de aparelho.
  const [deviceId, setDeviceId] = useState('responsive');
  const [landscape, setLandscape] = useState(false);
  const deviceRef = useRef<{ id: string; ua: string | null }>({ id: 'responsive', ua: null });
  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const isResponsive = device.id === 'responsive';
  const frameW = landscape ? device.h : device.w;
  const frameH = landscape ? device.w : device.h;

  // Zoom (nível do Electron: cada passo ≈ 20%).
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);

  // Escala automática do frame do device para caber no painel.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Console embutido (só do site).
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleMsgs, setConsoleMsgs] = useState<ConsoleMsg[]>([]);
  const errorCount = consoleMsgs.filter((m) => m.level >= 3).length;

  const hasUrl = !!active.url;
  const accent = accentColor || 'var(--accent)';

  const devServer = useDevServersStore((s) => selectDevServer(s.byPath, projectPath));
  const startDev = useDevServersStore((s) => s.start);
  const devUrl = devServer?.url ?? null;
  const devPhase = devServer?.phase ?? 'idle';
  const devRunning = devPhase === 'running' && !!devUrl;
  const devBusy = devPhase === 'installing' || devPhase === 'starting';
  const hasProject = !!projectPath;

  function patchActive(patch: Partial<BrowserTab>) {
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, ...patch } : t)));
  }

  // Auto-navega para a URL quando o dev server sobe.
  const autoOpen = useSettingsStore((s) => s.settings.autoOpenBrowserOnDev);
  const prevDevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevDevUrlRef.current;
    prevDevUrlRef.current = devUrl;
    if (autoOpen && devRunning && devUrl && devUrl !== prev) navigate(devUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devUrl, devRunning, autoOpen]);

  function onDevButton() {
    if (devRunning && devUrl) navigate(devUrl);
    else if (!devBusy && hasProject) void startDev(projectPath);
  }

  // Foca a barra de endereço quando o navegador fica visível sem página aberta.
  useEffect(() => {
    if (!visible || hasUrl) return;
    const id = requestAnimationFrame(() => addressRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [visible, hasUrl]);

  // Escala automática do frame (quando em modo aparelho).
  useEffect(() => {
    if (isResponsive) { setScale(1); return; }
    const el = stageRef.current;
    if (!el) return;
    const recompute = () => {
      const pad = 28;
      const availW = el.clientWidth - pad;
      const availH = el.clientHeight - pad;
      const s = Math.min(1, availW / frameW, availH / frameH);
      setScale(s > 0.1 ? s : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isResponsive, frameW, frameH]);

  // Eventos do webview.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    setCrashed(false);
    readyRef.current = false;
    const onReady = () => {
      readyRef.current = true;
      try {
        wcIdRef.current = wv.getWebContentsId();
        if (!defaultUaRef.current) defaultUaRef.current = wv.getUserAgent();
        const ua = deviceRef.current.ua;
        wv.setUserAgent(ua ?? defaultUaRef.current);
        wv.setZoomLevel(zoomRef.current);
      } catch { /* ignore */ }
    };
    const onStart = () => setLoading(true);
    const syncNav = () => {
      try {
        const u = wv.getURL();
        if (u && u !== 'about:blank') { patchActive({ url: u }); setAddress(u); onUrlChange(u); }
        setCanBack(wv.canGoBack());
        setCanFwd(wv.canGoForward());
      } catch { /* ignore */ }
    };
    const onStop = () => { setLoading(false); syncNav(); };
    const onTitle = (e: Event) => {
      const title = (e as unknown as { title?: string }).title;
      if (title) patchActive({ title });
    };
    const onFavicon = (e: Event) => {
      const favs = (e as unknown as { favicons?: string[] }).favicons;
      if (favs && favs.length) patchActive({ favicon: favs[0] });
    };
    const onDidNavigate = () => { patchActive({ favicon: null }); setConsoleMsgs([]); syncNav(); };
    const onConsole = (e: Event) => {
      const ev = e as unknown as { level: number; message: string; line: number; sourceId: string };
      setConsoleMsgs((prev) => {
        const next = prev.length >= 300 ? prev.slice(-260) : prev;
        return [...next, { id: ++consoleIdRef.current, level: ev.level ?? 1, text: ev.message ?? '', source: ev.sourceId ?? '', line: ev.line ?? 0 }];
      });
    };
    const onCrash = () => { setCrashed(true); setLoading(false); };
    wv.addEventListener('dom-ready', onReady);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', onDidNavigate);
    wv.addEventListener('did-navigate-in-page', syncNav);
    wv.addEventListener('page-title-updated', onTitle as EventListener);
    wv.addEventListener('page-favicon-updated', onFavicon as EventListener);
    wv.addEventListener('console-message', onConsole as EventListener);
    wv.addEventListener('crashed', onCrash);
    wv.addEventListener('render-process-gone', onCrash as EventListener);
    wv.addEventListener('unresponsive', onCrash);
    return () => {
      readyRef.current = false;
      wv.removeEventListener('dom-ready', onReady);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', onDidNavigate);
      wv.removeEventListener('did-navigate-in-page', syncNav);
      wv.removeEventListener('page-title-updated', onTitle as EventListener);
      wv.removeEventListener('page-favicon-updated', onFavicon as EventListener);
      wv.removeEventListener('console-message', onConsole as EventListener);
      wv.removeEventListener('crashed', onCrash);
      wv.removeEventListener('render-process-gone', onCrash as EventListener);
      wv.removeEventListener('unresponsive', onCrash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activeId, hasUrl]);

  // Popups (target=_blank / window.open) do webview → nova aba NESTE painel.
  useEffect(() => {
    const off = window.api.browser.onPopup(({ url, sourceId }) => {
      if (sourceId !== wcIdRef.current || !url) return;
      const id = newId('tab');
      setTabs((ts) => [...ts, { id, url, title: '', favicon: null }]);
      setActiveId(id);
      setAddress(url);
      setCanBack(false); setCanFwd(false); setCrashed(false); setLoading(false);
    });
    return off;
  }, []);

  function navigate(raw: string) {
    const url = normaliseUrl(raw);
    if (!url) return;
    setAddress(url);
    patchActive({ url });
    onUrlChange(url);
    const wv = webviewRef.current;
    if (wv && readyRef.current) {
      try { void wv.loadURL(url).catch(() => {}); } catch { /* src cobre */ }
    }
  }

  // ===== Abas =====
  function newTab() {
    const id = newId('tab');
    setTabs((ts) => [...ts, { id, url: '', title: '', favicon: null }]);
    setActiveId(id);
    setAddress('');
    setCanBack(false); setCanFwd(false); setCrashed(false); setLoading(false);
    setTimeout(() => addressRef.current?.focus(), 30);
  }
  function selectTab(id: string) {
    if (id === activeId) return;
    const t = tabs.find((x) => x.id === id);
    setActiveId(id);
    setAddress(t?.url ?? '');
    setCanBack(false); setCanFwd(false); setCrashed(false); setLoading(false);
  }
  function closeTab(id: string) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.id !== id);
    if (next.length === 0) {
      const fresh = { id: newId('tab'), url: '', title: '', favicon: null };
      setTabs([fresh]); setActiveId(fresh.id); setAddress('');
      setCanBack(false); setCanFwd(false); setCrashed(false); setLoading(false);
      return;
    }
    setTabs(next);
    if (id === activeId) {
      const neighbor = next[Math.min(idx, next.length - 1)];
      setActiveId(neighbor.id);
      setAddress(neighbor.url);
      setCanBack(false); setCanFwd(false); setCrashed(false); setLoading(false);
    }
  }

  function openExternal() { if (active.url) void window.api.devServer.openUrl(active.url); }
  function recover() { setCrashed(false); try { webviewRef.current?.reload(); } catch { /* ignore */ } }
  function hardRefresh() { webviewRef.current?.reloadIgnoringCache(); }

  function toggleDevTools() {
    const wv = webviewRef.current;
    if (!wv) return;
    try { wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools(); } catch { /* ignore */ }
  }

  async function clearCache() {
    await window.api.browser.clearCache();
    webviewRef.current?.reloadIgnoringCache();
    toast.success('Cache limpo');
  }

  function applyDevice(id: string) {
    const dev = DEVICES.find((d) => d.id === id) ?? DEVICES[0];
    setDeviceId(id);
    setLandscape(false);
    deviceRef.current = { id: dev.id, ua: dev.ua };
    const wv = webviewRef.current;
    if (!wv || !readyRef.current) return;
    try {
      if (!defaultUaRef.current) defaultUaRef.current = wv.getUserAgent();
      wv.setUserAgent(dev.ua ?? defaultUaRef.current);
      wv.reload();
    } catch { /* ignore */ }
  }

  function applyZoom(level: number) {
    const z = Math.max(-3, Math.min(4, level));
    setZoom(z);
    zoomRef.current = z;
    try { webviewRef.current?.setZoomLevel(z); } catch { /* ignore */ }
  }

  async function screenshot() {
    const wv = webviewRef.current;
    if (!wv) return;
    try {
      const img = await wv.capturePage();
      const dataUrl = img.toDataURL();
      const a = document.createElement('a');
      a.href = dataUrl;
      const host = (() => { try { return new URL(active.url).host; } catch { return 'page'; } })();
      a.download = `${host}-screenshot.png`;
      a.click();
      toast.success('Screenshot salva');
    } catch {
      toast.error('Não consegui capturar a página');
    }
  }

  const isSecure = /^https:\/\//i.test(active.url);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(active.url);
  const zoomPct = Math.round(Math.pow(1.2, zoom) * 100);

  return (
    <div className="flex h-full flex-col bg-bg-base">
      {/* ===== Barra de abas ===== */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border-subtle bg-bg-surface pl-2 pr-1.5">
        {projectName && (
          <div
            {...(dragHandleProps ?? {})}
            title={dragHandleProps ? 'Arraste para trocar a posição deste painel' : undefined}
            className={`flex min-w-0 shrink-0 items-center gap-1.5 pr-1 ${dragHandleProps ? 'cursor-grab active:cursor-grabbing' : ''}`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]" style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)`, color: accent }}>
              <Globe size={10} />
            </span>
            <span className="max-w-[110px] truncate text-[11px] font-semibold text-text-secondary">{projectName}</span>
            <span className="h-3.5 w-px bg-border-subtle" />
          </div>
        )}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <TabPill key={t.id} tab={t} active={t.id === activeId} loading={loading && t.id === activeId} closable={tabs.length > 1} onSelect={() => selectTab(t.id)} onClose={() => closeTab(t.id)} />
          ))}
          <button onClick={newTab} title="Nova aba" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <Plus size={14} />
          </button>
        </div>
        {onClose && (
          <button onClick={onClose} title="Fechar painel do navegador" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger">
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* ===== Toolbar ===== */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface px-2.5">
        <div className="flex items-center">
          <NavBtn disabled={!canBack} onClick={() => webviewRef.current?.goBack()} title="Voltar"><ArrowLeft size={15} /></NavBtn>
          <NavBtn disabled={!canFwd} onClick={() => webviewRef.current?.goForward()} title="Avançar"><ArrowRight size={15} /></NavBtn>
          <NavBtn onClick={() => (loading ? webviewRef.current?.stop() : webviewRef.current?.reload())} title={loading ? 'Parar' : 'Recarregar'}>
            {loading ? <XIcon size={15} /> : <RotateCw size={15} />}
          </NavBtn>
        </div>

        {/* Endereço */}
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-1.5 transition-colors focus-within:border-accent">
          {loading
            ? <Loader2 size={12} className="shrink-0 animate-spin text-text-muted" />
            : hasUrl
              ? (isSecure || isLocal ? <Lock size={11} className="shrink-0 text-success" /> : <Globe size={12} className="shrink-0 text-text-muted" />)
              : <Search size={12} className="shrink-0 text-text-muted" />}
          <input
            ref={addressRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(address); }}
            onFocus={(e) => e.target.select()}
            placeholder="Buscar ou digitar endereço…  ( localhost:5173 · https://… )"
            className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
            spellCheck={false}
          />
          {active.url && (
            <button onClick={openExternal} title="Abrir no navegador externo" className="shrink-0 text-text-muted transition-colors hover:text-text-primary">
              <ExternalLink size={13} />
            </button>
          )}
        </div>

        {/* Ferramentas */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-base/50 p-0.5">
          <NavBtn onClick={hardRefresh} title="Hard refresh (ignora o cache)"><Zap size={14} /></NavBtn>
          <NavBtn onClick={() => void clearCache()} title="Limpar cache e recarregar"><Eraser size={14} /></NavBtn>
          <DeviceMenu deviceId={deviceId} landscape={landscape} onPick={applyDevice} onToggleLandscape={() => setLandscape((v) => !v)} />
          <span className="mx-0.5 h-5 w-px bg-border-subtle" />
          <NavBtn onClick={() => applyZoom(zoom - 1)} title="Diminuir zoom"><ZoomOut size={14} /></NavBtn>
          <button onClick={() => applyZoom(0)} title="Resetar zoom" className="min-w-[34px] rounded px-1 text-[10px] font-semibold tabular-nums text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">{zoomPct}%</button>
          <NavBtn onClick={() => applyZoom(zoom + 1)} title="Aumentar zoom"><ZoomIn size={14} /></NavBtn>
          <span className="mx-0.5 h-5 w-px bg-border-subtle" />
          <NavBtn onClick={() => void screenshot()} title="Capturar a página (screenshot)"><Camera size={14} /></NavBtn>
          <NavBtn onClick={() => setConsoleOpen((v) => !v)} active={consoleOpen} title="Console do site (logs/erros)">
            <span className="relative">
              <SquareTerminal size={14} />
              {errorCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white" style={{ background: 'var(--danger)' }}>{errorCount > 9 ? '9+' : errorCount}</span>}
            </span>
          </NavBtn>
          <NavBtn onClick={toggleDevTools} title="DevTools completo (Chromium)"><Bug size={14} /></NavBtn>
        </div>

        {/* Dev server */}
        {hasProject && (
          <>
            <button
              onClick={onDevButton}
              disabled={devBusy}
              title={devRunning ? `Abrir dev server (${devUrl})` : 'Iniciar dev server do projeto'}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-medium transition-colors disabled:cursor-wait"
              style={devRunning
                ? { background: 'var(--bg-base)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
                : { background: 'color-mix(in srgb, var(--success) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 40%, transparent)', color: 'var(--success)' }}
            >
              {devBusy
                ? <><Loader2 size={12} className="animate-spin" /> {devPhase === 'installing' ? 'instalando…' : 'iniciando…'}</>
                : devRunning
                  ? <><span className="claude-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 5px var(--success)' }} /> <span className="font-mono text-text-tertiary">{devUrl?.replace(/^https?:\/\//, '')}</span></>
                  : <><Play size={12} fill="currentColor" /> Iniciar dev</>}
            </button>
            {devRunning && (
              <NavBtn onClick={() => void useDevServersStore.getState().stop(projectPath)} title="Parar dev server"><Square size={12} fill="currentColor" /></NavBtn>
            )}
          </>
        )}
      </div>

      {/* ===== Conteúdo ===== */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          {!hasUrl ? (
            <BrowserEmptyState hasProject={hasProject} devRunning={devRunning} devBusy={devBusy} devPhase={devPhase} devUrl={devUrl} onDev={onDevButton} onOpen={(u) => navigate(u)} />
          ) : visible ? (
            <div
              ref={stageRef}
              className="flex h-full w-full items-center justify-center overflow-auto"
              style={isResponsive ? undefined : { background: 'var(--bg-active)', padding: 14 }}
            >
              <div style={isResponsive ? { width: '100%', height: '100%' } : { width: frameW * scale, height: frameH * scale, flexShrink: 0 }}>
                <div
                  style={isResponsive
                    ? { width: '100%', height: '100%' }
                    : { width: frameW, height: frameH, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: 10, overflow: 'hidden', boxShadow: '0 0 0 1px var(--border-default), 0 14px 50px rgba(0,0,0,0.5)' }}
                >
                  <webview
                    key={activeId}
                    ref={webviewRef as unknown as React.Ref<HTMLElement>}
                    src={active.url}
                    {...({ allowpopups: 'true' } as Record<string, string>)}
                    partition="persist:voltz-browser"
                    style={{ display: 'flex', width: '100%', height: '100%' }}
                  />
                </div>
              </div>
              {!isResponsive && (
                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border-subtle bg-bg-overlay/90 px-2.5 py-1 text-[10px] font-medium tabular-nums text-text-tertiary backdrop-blur">
                  {device.label} · {frameW}×{frameH} · {device.dpr}x{scale < 0.999 ? ` · ${Math.round(scale * 100)}%` : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-base p-6 text-center">
              <Globe size={20} className="text-text-disabled" />
              <p className="text-[12px] text-text-tertiary">Navegador pausado</p>
              <p className="max-w-xs text-[11px] text-text-muted">Volte para esta aba para retomar a página.</p>
            </div>
          )}

          {crashed && visible && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-base/95 p-6 text-center backdrop-blur">
              <div className="rounded-2xl p-3" style={{ background: 'var(--danger-soft)' }}><Bug size={22} className="text-danger" /></div>
              <p className="text-[13px] font-semibold text-text-secondary">A página travou</p>
              <p className="max-w-xs text-[11.5px] text-text-tertiary">O conteúdo do navegador interno parou de responder. Recarregue para tentar de novo.</p>
              <button onClick={recover} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
                <RotateCw size={13} /> Recarregar
              </button>
            </div>
          )}
        </div>

        {/* Console embutido */}
        {consoleOpen && (
          <ConsolePanel msgs={consoleMsgs} onClear={() => setConsoleMsgs([])} onClose={() => setConsoleOpen(false)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Console embutido (só do site)
// ============================================================================

const LEVEL_META: Record<number, { color: string; bg: string; label: string }> = {
  3: { color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 10%, transparent)', label: 'erro' },
  2: { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 10%, transparent)', label: 'aviso' },
};

function ConsolePanel({ msgs, onClear, onClose }: { msgs: ConsoleMsg[]; onClear: () => void; onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | 'errors'>('all');
  const endRef = useRef<HTMLDivElement | null>(null);
  const shown = filter === 'errors' ? msgs.filter((m) => m.level >= 2) : msgs;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  return (
    <div className="flex h-[38%] min-h-[120px] shrink-0 flex-col border-t border-border-default bg-bg-base">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-2.5">
        <SquareTerminal size={13} className="text-accent" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Console</span>
        <span className="rounded-full bg-bg-active px-1.5 py-px text-[9px] font-bold tabular-nums text-text-tertiary">{msgs.length}</span>
        <div className="ml-2 flex items-center gap-0.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Tudo</FilterChip>
          <FilterChip active={filter === 'errors'} onClick={() => setFilter('errors')}>Erros/avisos</FilterChip>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={onClear} title="Limpar" className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><Trash2 size={13} /></button>
          <button onClick={onClose} title="Fechar console" className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><XIcon size={13} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 font-mono text-[11px] leading-relaxed">
        {shown.length === 0 && (
          <div className="px-3 py-6 text-center text-text-muted">Sem mensagens. Os <code>console.log</code> e erros do site aparecem aqui.</div>
        )}
        {shown.map((m) => {
          const meta = LEVEL_META[m.level];
          return (
            <div key={m.id} className="flex items-start gap-2 px-3 py-0.5" style={meta ? { background: meta.bg } : undefined}>
              {m.level >= 3 ? <XIcon size={12} className="mt-0.5 shrink-0 text-danger" />
                : m.level === 2 ? <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
                : <span className="mt-0.5 shrink-0 text-text-disabled">›</span>}
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words" style={{ color: meta?.color ?? 'var(--text-secondary)' }}>{m.text}</span>
              {m.source && <span className="shrink-0 text-text-disabled">{m.source.split('/').pop()}:{m.line}</span>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors" style={{ background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
      {children}
    </button>
  );
}

// ============================================================================
// Menu de aparelhos (emulador)
// ============================================================================

function DeviceMenu({ deviceId, landscape, onPick, onToggleLandscape }: {
  deviceId: string; landscape: boolean; onPick: (id: string) => void; onToggleLandscape: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const isResponsive = active.id === 'responsive';

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Emular aparelho"
        className="flex h-8 items-center gap-1 rounded-lg px-1.5 transition-colors hover:bg-bg-hover"
        style={!isResponsive || open ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : { color: 'var(--text-tertiary)' }}
      >
        {isResponsive ? <Monitor size={14} /> : <Smartphone size={14} />}
        <ChevronDown size={11} className="opacity-60" />
      </button>
      {!isResponsive && (
        <button onClick={onToggleLandscape} title="Rotacionar" className="flex h-8 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary" style={landscape ? { color: 'var(--accent)' } : undefined}>
          <RotateCcw size={13} />
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-border-default bg-bg-overlay py-1 shadow-lg">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => { onPick(d.id); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-hover"
              style={{ color: d.id === deviceId ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              {d.id === 'responsive' ? <Monitor size={13} className="shrink-0" /> : <Smartphone size={13} className="shrink-0" />}
              <span className="flex-1">{d.label}</span>
              {d.id !== 'responsive' && <span className="text-[10px] tabular-nums text-text-muted">{d.w}×{d.h}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Aba + ícone
// ============================================================================

function TabIcon({ favicon, loading, active }: { favicon: string | null; loading: boolean; active: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [favicon]);
  if (loading) return <Loader2 size={11} className="shrink-0 animate-spin text-accent" />;
  if (favicon && !failed) {
    return <img src={favicon} alt="" onError={() => setFailed(true)} className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" />;
  }
  return <Globe size={11} className={`shrink-0 ${active ? 'text-accent' : 'text-text-muted'}`} />;
}

function TabPill({ tab, active, loading, closable, onSelect, onClose }: {
  tab: BrowserTab; active: boolean; loading: boolean; closable: boolean; onSelect: () => void; onClose: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
      title={tab.url || 'Nova aba'}
      className="group flex min-w-0 max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors"
      style={{ height: 26, background: active ? 'var(--bg-base)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px var(--border-subtle)' : 'none' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <TabIcon favicon={tab.favicon} loading={loading} active={active} />
      <span className={`min-w-0 flex-1 truncate text-[11px] ${active ? 'font-medium text-text-primary' : 'text-text-tertiary'}`}>{tabLabel(tab)}</span>
      {closable && (
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} title="Fechar aba" className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:bg-bg-active hover:text-text-primary group-hover:opacity-100" style={{ opacity: active ? 1 : undefined }}>
          <XIcon size={11} />
        </button>
      )}
    </div>
  );
}

function BrowserEmptyState({ hasProject, devRunning, devBusy, devPhase, devUrl, onDev, onOpen }: {
  hasProject: boolean; devRunning: boolean; devBusy: boolean; devPhase: string; devUrl: string | null; onDev: () => void; onOpen: (url: string) => void;
}) {
  const [q, setQ] = useState('');
  const shortcuts = [
    { label: 'localhost:3000', url: 'localhost:3000' },
    { label: 'localhost:5173', url: 'localhost:5173' },
    { label: 'localhost:8080', url: 'localhost:8080' },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-bg-base p-6">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--accent-soft)' }}><Globe size={26} className="text-accent" /></div>
        <p className="text-[14px] font-semibold text-text-secondary">Navegador interno</p>
        <p className="text-[11.5px] text-text-muted">Pré-visualize seu projeto sem sair do app</p>
      </div>
      <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border-subtle bg-bg-surface px-3 py-2.5 shadow-sm focus-within:border-accent">
        <Search size={14} className="text-text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) onOpen(q); }} placeholder="Buscar ou digitar um endereço e Enter…" className="flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-muted" spellCheck={false} />
      </div>
      {hasProject && (
        <button
          onClick={onDev}
          disabled={devBusy}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-[12.5px] font-semibold transition-all hover:brightness-110 disabled:cursor-wait"
          style={{ background: devRunning ? 'var(--success)' : 'var(--accent)', color: 'var(--accent-fg)', boxShadow: `0 2px 12px -3px color-mix(in srgb, ${devRunning ? 'var(--success)' : 'var(--accent)'} 60%, transparent)` }}
        >
          {devBusy
            ? <><Loader2 size={14} className="animate-spin" /> {devPhase === 'installing' ? 'Instalando…' : 'Iniciando…'}</>
            : devRunning && devUrl
              ? <><Play size={14} fill="currentColor" /> Abrir dev server · {devUrl.replace(/^https?:\/\//, '')}</>
              : <><Play size={14} fill="currentColor" /> Iniciar dev server</>}
        </button>
      )}
      <div className="flex items-center gap-1.5">
        {shortcuts.map((s) => (
          <button key={s.url} onClick={() => onOpen(s.url)} className="rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 font-mono text-[10.5px] text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary">{s.label}</button>
        ))}
      </div>
    </div>
  );
}

function NavBtn({ children, onClick, disabled, title, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${active ? '' : 'text-text-tertiary hover:text-text-primary'}`}
      style={active ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 16%, transparent)' } : undefined}
    >
      {children}
    </button>
  );
}
