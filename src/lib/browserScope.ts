/**
 * Registro de ESCOPO do navegador para o isolamento por aba.
 *
 * Cada Claude rodando num terminal só pode ver/controlar o navegador que está na
 * MESMA aba dele. Para isso, o renderer informa ao main (servidor MCP) dois
 * mapas, recalculados e enviados (com debounce) sempre que algo muda:
 *   - agents:   token-do-terminal → tabId   (cada terminal tem um token único,
 *               exportado como VOLTZ_TERMINAL_TOKEN no shell; o claude o envia
 *               no header X-Voltz-Terminal)
 *   - browsers: webContentsId-do-webview → tabId
 *
 * O servidor, ao receber uma chamada, descobre a aba do terminal pelo token e só
 * deixa enxergar os webviews daquela aba.
 */

interface AgentEntry { token: string; tabId: string }
interface BrowserEntry { wcId: number; tabId: string }

const agents = new Map<string, AgentEntry>();   // key: paneId do terminal
const browsers = new Map<string, BrowserEntry>(); // key: paneId do navegador

let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const snapshot = {
    agents: Object.fromEntries([...agents.values()].map((a) => [a.token, a.tabId])),
    browsers: Object.fromEntries([...browsers.values()].map((b) => [String(b.wcId), b.tabId])),
  };
  void window.api.browser.setScope(snapshot);
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 120);
}

/** Gera (ou reusa) um token aleatório para um terminal. */
export function newAgentToken(): string {
  try { return crypto.randomUUID(); }
  catch { return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
}

/** Registra/atualiza um terminal (agente) e sua aba. */
export function setAgentScope(paneId: string, token: string, tabId: string) {
  const cur = agents.get(paneId);
  if (cur && cur.token === token && cur.tabId === tabId) return;
  agents.set(paneId, { token, tabId });
  schedule();
}

/** Registra/atualiza um navegador (webview) e sua aba. */
export function setBrowserScope(paneId: string, wcId: number, tabId: string) {
  const cur = browsers.get(paneId);
  if (cur && cur.wcId === wcId && cur.tabId === tabId) return;
  browsers.set(paneId, { wcId, tabId });
  schedule();
}

/** Remove o terminal (agente) do escopo ao desmontar. */
export function clearAgentScope(paneId: string) {
  if (agents.delete(paneId)) schedule();
}

/** Remove o navegador do escopo ao desmontar. */
export function clearBrowserScope(paneId: string) {
  if (browsers.delete(paneId)) schedule();
}
