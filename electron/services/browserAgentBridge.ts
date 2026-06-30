import { EventEmitter } from 'node:events';
import type { WebContents, NativeImage } from 'electron';

/**
 * Ponte entre os <webview> do navegador interno (BrowserPane) e o servidor MCP
 * (browserMcpServer). O main intercepta `web-contents-created` e, para cada
 * webview, chama `trackWebview()`. Aqui mantemos o registro das abas vivas, um
 * buffer de console por aba e expomos as operações que as ferramentas MCP usam
 * (screenshot, navegar, clicar, etc.).
 *
 * Tudo roda no processo MAIN, que tem acesso direto ao webContents de cada
 * webview — não precisa passar pelo renderer.
 */

interface ConsoleEntry {
  level: number; // 0=log/info, 1=warn(?), 2=warning, 3=error (mapeamento do Electron)
  message: string;
  source: string;
  line: number;
  ts: number;
}

interface TrackedView {
  wc: WebContents;
  console: ConsoleEntry[];
  lastNavTs: number;
}

const MAX_CONSOLE = 200;
const views = new Map<number, TrackedView>();
let lastActiveId: number | null = null;

// ===========================================================================
// ESCOPO (isolamento por aba): cada terminal só enxerga os navegadores da SUA
// aba. O renderer informa o mapeamento (token do terminal → aba, e webview →
// aba); o servidor passa o token do chamador (header X-Voltz-Terminal).
// ===========================================================================
const agentTabByToken = new Map<string, string>(); // token do terminal → tabId
const tabByWebContents = new Map<number, string>(); // webContentsId → tabId

/** Substitui o mapa de escopo (snapshot completo vindo do renderer). */
export function setScope(snapshot: { agents?: Record<string, string>; browsers?: Record<string, string> }): void {
  agentTabByToken.clear();
  for (const [token, tabId] of Object.entries(snapshot.agents ?? {})) {
    if (token && tabId) agentTabByToken.set(token, tabId);
  }
  tabByWebContents.clear();
  for (const [wcId, tabId] of Object.entries(snapshot.browsers ?? {})) {
    if (tabId) tabByWebContents.set(Number(wcId), tabId);
  }
}

/** Aba do terminal que está chamando (null se token desconhecido/ausente). */
function callerTab(token?: string | null): string | null {
  if (!token) return null;
  return agentTabByToken.get(token) ?? null;
}

/** O webview `wcId` está na mesma aba do terminal chamador? */
function inScope(wcId: number, token?: string | null): boolean {
  const tab = callerTab(token);
  if (!tab) return false;
  return tabByWebContents.get(wcId) === tab;
}

/** Emite eventos de atividade do agente (main → renderer, para o indicador). */
export const agentActivity = new EventEmitter();

function emitActivity(action: string, webContentsId: number, detail?: string) {
  agentActivity.emit('activity', { action, webContentsId, detail: detail ?? null, ts: Date.now() });
}

/** Registra um webview recém-criado. Idempotente. */
export function trackWebview(wc: WebContents): void {
  const id = wc.id;
  if (views.has(id)) return;
  const view: TrackedView = { wc, console: [], lastNavTs: Date.now() };
  views.set(id, view);
  lastActiveId = id;

  const onConsole = (
    _e: unknown,
    level: number,
    message: string,
    line: number,
    sourceId: string,
  ) => {
    const buf = view.console;
    buf.push({ level, message, source: sourceId, line, ts: Date.now() });
    if (buf.length > MAX_CONSOLE) buf.splice(0, buf.length - MAX_CONSOLE);
  };
  const onNav = () => { view.lastNavTs = Date.now(); lastActiveId = id; };
  const onFocus = () => { lastActiveId = id; };

  wc.on('console-message', onConsole as never);
  wc.on('did-navigate', onNav);
  wc.on('did-navigate-in-page', onNav);
  wc.on('focus', onFocus);
  wc.once('destroyed', () => {
    views.delete(id);
    if (lastActiveId === id) {
      // próximo "ativo" = o webview vivo mais recentemente navegado.
      let best: number | null = null;
      let bestTs = -1;
      for (const [vid, v] of views) {
        if (v.lastNavTs > bestTs) { bestTs = v.lastNavTs; best = vid; }
      }
      lastActiveId = best;
    }
  });
}

/** Lista os navegadores vivos NA MESMA ABA do terminal chamador. */
export function listTargets(token?: string | null): Array<{ id: number; url: string; title: string; active: boolean }> {
  const out: Array<{ id: number; url: string; title: string; active: boolean }> = [];
  for (const [id, v] of views) {
    if (v.wc.isDestroyed()) continue;
    if (!inScope(id, token)) continue; // só os da aba deste terminal
    let url = '';
    let title = '';
    try { url = v.wc.getURL(); } catch { /* ignore */ }
    try { title = v.wc.getTitle(); } catch { /* ignore */ }
    out.push({ id, url, title, active: id === lastActiveId });
  }
  return out;
}

/**
 * Resolve o webContents alvo DENTRO do escopo (aba) do terminal chamador.
 * Sem id, usa o navegador da aba do chamador (o mais recente, se houver vários).
 */
function resolveTarget(targetId: number | undefined, token: string | null | undefined): WebContents | null {
  if (typeof targetId === 'number') {
    const v = views.get(targetId);
    if (v && !v.wc.isDestroyed() && inScope(targetId, token)) return v.wc;
    return null; // alvo inexistente OU fora da aba deste terminal → negado
  }
  // Sem id: melhor navegador DA ABA do chamador (mais recentemente navegado).
  let best: WebContents | null = null;
  let bestTs = -1;
  for (const [id, v] of views) {
    if (v.wc.isDestroyed() || !inScope(id, token)) continue;
    if (v.lastNavTs > bestTs) { bestTs = v.lastNavTs; best = v.wc; }
  }
  return best;
}

class NoTargetError extends Error {
  constructor() {
    super('Nenhum navegador na MESMA aba deste terminal. Para eu ver/controlar, abra um navegador NESTA aba (ex.: um split de navegador ao lado do terminal). Cada terminal só acessa o navegador da sua própria aba.');
  }
}

function requireTarget(targetId: number | undefined, token: string | null | undefined): WebContents {
  const wc = resolveTarget(targetId, token);
  if (!wc) throw new NoTargetError();
  return wc;
}

/** Espera a página parar de carregar (ou estoura o timeout). */
function waitForLoad(wc: WebContents, ms = 12_000): Promise<void> {
  return new Promise((resolve) => {
    if (!wc.isLoading()) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      wc.off('did-stop-loading', finish);
      wc.off('did-fail-load', finish as never);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    wc.once('did-stop-loading', finish);
    wc.once('did-fail-load', finish as never);
  });
}

function stateOf(wc: WebContents) {
  return {
    webContentsId: wc.id,
    url: safe(() => wc.getURL(), ''),
    title: safe(() => wc.getTitle(), ''),
    loading: safe(() => wc.isLoading(), false),
    // Electron 29: canGoBack/canGoForward ainda existem (navigationHistory é 31+).
    canGoBack: safe(() => (wc as unknown as { canGoBack(): boolean }).canGoBack(), false),
    canGoForward: safe(() => (wc as unknown as { canGoForward(): boolean }).canGoForward(), false),
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// ===========================================================================
// Operações usadas pelas ferramentas MCP
// ===========================================================================

export async function opGetState(targetId?: number, token?: string | null) {
  return stateOf(requireTarget(targetId, token));
}

/**
 * Captura um frame da página — funciona MESMO com a aba em segundo plano.
 *
 * O segredo está no renderer: abas inativas com navegador usam `opacity:0` (não
 * `visibility:hidden`), então o <webview> segue pintando e o `capturePage`
 * abaixo retorna o conteúdo real. Uma retentativa curta cobre o caso de a página
 * ter acabado de montar.
 */
async function captureLive(wc: WebContents): Promise<NativeImage | null> {
  try {
    const i = await wc.capturePage();
    if (!i.isEmpty()) return i;
  } catch { /* tenta de novo abaixo */ }
  await new Promise((r) => setTimeout(r, 250));
  try {
    const i = await wc.capturePage();
    if (!i.isEmpty()) return i;
  } catch { /* ignore */ }
  return null;
}

export async function opScreenshot(targetId?: number, token?: string | null): Promise<{ pngBase64: string; width: number; height: number; url: string }> {
  const wc = requireTarget(targetId, token);
  emitActivity('screenshot', wc.id);
  const img = await captureLive(wc);
  if (!img || img.isEmpty()) {
    throw new Error('Não consegui capturar a página. Se o navegador estiver oculto dentro de um painel em modo terminal, deixe-o visível (ex.: um split de navegador ao lado do terminal).');
  }
  const size = img.getSize();
  // Reduz para no máx. ~1400px de largura — economiza tokens sem perder leitura.
  const scaled = size.width > 1400 ? img.resize({ width: 1400 }) : img;
  const finalSize = scaled.getSize();
  return {
    pngBase64: scaled.toPNG().toString('base64'),
    width: finalSize.width,
    height: finalSize.height,
    url: safe(() => wc.getURL(), ''),
  };
}

export async function opNavigate(url: string, targetId?: number, token?: string | null) {
  const wc = requireTarget(targetId, token);
  emitActivity('navigate', wc.id, url);
  try {
    await wc.loadURL(url);
  } catch (e) {
    // loadURL rejeita em alguns redirects/abortos — não é fatal, seguimos pro estado.
    void e;
  }
  await waitForLoad(wc);
  return stateOf(wc);
}

async function runJs(wc: WebContents, code: string): Promise<unknown> {
  // userGesture=true: permite handlers que exigem ativação do usuário.
  return wc.executeJavaScript(code, true);
}

/**
 * JS (idempotente) injetado na página que cria o "cursor do Claude": uma seta
 * laranja com etiqueta + um anel de clique (ripple). Estilos via CSSOM (não via
 * atributos style) p/ não esbarrar em CSP estrito. `pointer-events:none` para
 * nunca atrapalhar a página. Some sozinho depois de ~2.8s.
 */
export const CURSOR_BOOTSTRAP = `(function(){
  if (window.__voltzCursor) return;
  var root = document.documentElement;
  var c = document.createElement('div'); c.id='__voltz_cursor__'; var s=c.style;
  s.position='fixed'; s.left='0'; s.top='0'; s.zIndex='2147483647'; s.pointerEvents='none';
  s.transition='transform .35s cubic-bezier(.22,1,.36,1)'; s.opacity='0'; s.willChange='transform';
  c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3l15 9-6 1.6L11 20 5 3z" fill="#ff7a1a" stroke="#ffffff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  var svg=c.firstChild; if(svg){ svg.style.filter='drop-shadow(0 1px 2px rgba(0,0,0,.5))'; svg.style.display='block'; }
  var tag=document.createElement('span'); tag.textContent='Claude'; var t=tag.style;
  t.position='absolute'; t.left='22px'; t.top='15px'; t.background='#ff7a1a'; t.color='#fff';
  t.font='600 10px/1 ui-sans-serif,system-ui,sans-serif'; t.padding='3px 6px'; t.borderRadius='6px';
  t.whiteSpace='nowrap'; t.boxShadow='0 2px 8px rgba(0,0,0,.35)'; c.appendChild(tag); root.appendChild(c);
  var ring=document.createElement('div'); var r=ring.style;
  r.position='fixed'; r.zIndex='2147483646'; r.pointerEvents='none'; r.width='34px'; r.height='34px';
  r.borderRadius='50%'; r.border='2px solid #ff7a1a'; r.opacity='0'; r.transform='translate(-50%,-50%) scale(.4)';
  root.appendChild(ring); var hideT;
  window.__voltzCursor={
    move:function(x,y){ s.transform='translate('+x+'px,'+y+'px)'; s.opacity='1'; clearTimeout(hideT); hideT=setTimeout(function(){ s.opacity='0'; },2800); },
    ripple:function(x,y){ r.transition='none'; r.left=x+'px'; r.top=y+'px'; r.transform='translate(-50%,-50%) scale(.4)'; r.opacity='.9';
      requestAnimationFrame(function(){ r.transition='transform .5s ease-out,opacity .5s ease-out'; r.transform='translate(-50%,-50%) scale(1.7)'; r.opacity='0'; }); }
  };
})();`;

/** Trecho JS que rola até `el` (suave, centralizado) e leva o cursor até ele. */
function pointCode(ripple: boolean): string {
  return "el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});"
    + "var _c=function(){var r=el.getBoundingClientRect();return [r.left+r.width/2, r.top+r.height/2];};"
    + "var _p=_c(); window.__voltzCursor.move(_p[0],_p[1]);"
    + "setTimeout(function(){var q=_c(); window.__voltzCursor.move(q[0],q[1]);"
    + (ripple ? "window.__voltzCursor.ripple(q[0],q[1]);" : "")
    + "},370);";
}

export async function opClick(selector: string, targetId?: number, token?: string | null) {
  const wc = requireTarget(targetId, token);
  emitActivity('click', wc.id, selector);
  const code = `(function(){${CURSOR_BOOTSTRAP}`
    + `var el=document.querySelector(${JSON.stringify(selector)});`
    + `if(!el){return JSON.stringify({ok:false,error:'Seletor não encontrado: '+${JSON.stringify(selector)}});}`
    + pointCode(true)
    + `if(typeof el.click==='function'){el.click();}else{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}`
    + `return JSON.stringify({ok:true});})()`;
  const raw = await runJs(wc, code);
  return JSON.parse(String(raw)) as { ok: boolean; error?: string };
}

export async function opScrollTo(selector: string, targetId?: number, token?: string | null) {
  const wc = requireTarget(targetId, token);
  emitActivity('scroll', wc.id, selector);
  const code = `(function(){${CURSOR_BOOTSTRAP}`
    + `var el=document.querySelector(${JSON.stringify(selector)});`
    + `if(!el){return JSON.stringify({ok:false,error:'Seletor não encontrado: '+${JSON.stringify(selector)}});}`
    + pointCode(true)
    + `return JSON.stringify({ok:true});})()`;
  const raw = await runJs(wc, code);
  return JSON.parse(String(raw)) as { ok: boolean; error?: string };
}

export async function opFill(selector: string, value: string, targetId?: number, token?: string | null) {
  const wc = requireTarget(targetId, token);
  emitActivity('fill', wc.id, selector);
  const code = `(function(){${CURSOR_BOOTSTRAP}`
    + `var el=document.querySelector(${JSON.stringify(selector)});`
    + `if(!el){return JSON.stringify({ok:false,error:'Seletor não encontrado: '+${JSON.stringify(selector)}});}`
    + pointCode(false)
    + `el.focus();var v=${JSON.stringify(value)};`
    + `const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;`
    + `const setter=Object.getOwnPropertyDescriptor(proto,'value');`
    + `if(setter&&setter.set){setter.set.call(el,v);}else{el.value=v;}`
    + `el.dispatchEvent(new Event('input',{bubbles:true}));`
    + `el.dispatchEvent(new Event('change',{bubbles:true}));`
    + `return JSON.stringify({ok:true});})()`;
  const raw = await runJs(wc, code);
  return JSON.parse(String(raw)) as { ok: boolean; error?: string };
}

export async function opEval(expression: string, targetId?: number, token?: string | null): Promise<{ ok: boolean; value?: string; error?: string }> {
  const wc = requireTarget(targetId, token);
  emitActivity('eval', wc.id);
  const code = `(()=>{try{const r=(function(){return (${expression});})();`
    + `return JSON.stringify({ok:true,value:(typeof r==='string'?r:JSON.stringify(r))});`
    + `}catch(e){return JSON.stringify({ok:false,error:String(e&&e.message?e.message:e)});}})()`;
  const raw = await runJs(wc, code);
  return JSON.parse(String(raw)) as { ok: boolean; value?: string; error?: string };
}

export function opReadConsole(targetId: number | undefined, minLevel: number, token?: string | null): ConsoleEntry[] {
  const wc = requireTarget(targetId, token);
  const v = views.get(wc.id);
  if (!v) return [];
  return v.console.filter((c) => c.level >= minLevel);
}
