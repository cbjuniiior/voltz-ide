import http from 'node:http';
import crypto from 'node:crypto';
import { app } from 'electron';
import {
  listTargets, opGetState, opScreenshot, opNavigate,
  opClick, opFill, opEval, opReadConsole, opScrollTo,
} from './browserAgentBridge';

/**
 * Servidor MCP (Model Context Protocol) mínimo, sobre HTTP "streamable", rodando
 * dentro do processo main do Electron. Expõe ao Claude Code (que roda nos
 * terminais do app) ferramentas para VER e CONTROLAR o navegador interno.
 *
 * Implementação à mão (sem o SDK ESM, que atrita com o build CommonJS): só
 * precisamos de JSON-RPC 2.0 stateless — `initialize`, `tools/list`,
 * `tools/call`. Respondemos sempre `application/json` (modo permitido pela spec
 * quando não há streaming server→client). Bind em 127.0.0.1 + token Bearer.
 */

const PROTOCOL_VERSION = '2025-06-18';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function textBlock(text: string) { return { type: 'text', text }; }

const TARGET_PROP = {
  targetId: { type: 'number', description: 'ID da aba (webContentsId) de browser_list_targets. Omita para usar a aba ativa.' },
};

const TOOLS: ToolDef[] = [
  {
    name: 'browser_list_targets',
    description: 'Lista as abas abertas no navegador interno do Voltz IDE (id, url, título). Use o id como targetId nas outras ferramentas. A aba "active:true" é a usada por padrão.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const targets = listTargets();
      if (targets.length === 0) return [textBlock('Nenhuma aba aberta no navegador interno. Abra o painel "Navegador" no Voltz e carregue uma página.')];
      return [textBlock(JSON.stringify(targets, null, 2))];
    },
  },
  {
    name: 'browser_get_state',
    description: 'Estado atual da aba: url, título, se está carregando e se pode voltar/avançar.',
    inputSchema: { type: 'object', properties: { ...TARGET_PROP } },
    async handler(args) {
      const s = await opGetState(num(args.targetId));
      return [textBlock(JSON.stringify(s, null, 2))];
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Captura a página visível da aba e retorna a imagem (PNG) para você analisar visualmente. Use para validar layout, conferir se algo renderizou, comparar com o esperado.',
    inputSchema: { type: 'object', properties: { ...TARGET_PROP } },
    async handler(args) {
      const shot = await opScreenshot(num(args.targetId));
      return [
        { type: 'image', data: shot.pngBase64, mimeType: 'image/png' },
        textBlock(`Screenshot de ${shot.url || '(sem url)'} — ${shot.width}×${shot.height}px.`),
      ];
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navega a aba ativa (ou targetId) para uma URL e espera carregar. Retorna o novo estado.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'URL completa (ex.: http://localhost:5173/login).' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const s = await opNavigate(str(args.url), num(args.targetId));
      return [textBlock(JSON.stringify(s, null, 2))];
    },
  },
  {
    name: 'browser_scroll_to',
    description: 'Rola a página até o elemento (seletor CSS), centralizando-o de forma suave, e aponta o cursor visual do Claude para ele. Use para "olhar"/validar uma seção específica (hero, rodapé, um card) — a visão do usuário acompanha você, em vez de ficar parada.',
    inputSchema: {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: 'string', description: 'Seletor CSS do elemento a focar (ex.: "header", "#precos", "footer").' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const r = await opScrollTo(str(args.selector), num(args.targetId));
      return [textBlock(r.ok ? 'Rolei até o elemento e apontei o cursor.' : `Falhou: ${r.error}`)];
    },
  },
  {
    name: 'browser_click',
    description: 'Clica no primeiro elemento que casa com o seletor CSS na página. Mostra o cursor do Claude no ponto e rola até ele.',
    inputSchema: {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: 'string', description: 'Seletor CSS (ex.: "button.submit", "a[href=\\"/login\\"]").' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const r = await opClick(str(args.selector), num(args.targetId));
      return [textBlock(r.ok ? 'Clique realizado.' : `Falhou: ${r.error}`)];
    },
  },
  {
    name: 'browser_fill',
    description: 'Preenche um campo (input/textarea) com um valor, disparando os eventos input/change (compatível com React).',
    inputSchema: {
      type: 'object',
      required: ['selector', 'value'],
      properties: {
        selector: { type: 'string', description: 'Seletor CSS do campo.' },
        value: { type: 'string', description: 'Valor a digitar.' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const r = await opFill(str(args.selector), str(args.value), num(args.targetId));
      return [textBlock(r.ok ? 'Campo preenchido.' : `Falhou: ${r.error}`)];
    },
  },
  {
    name: 'browser_eval',
    description: 'Avalia uma EXPRESSÃO JavaScript no contexto da página e retorna o valor (serializado). Ex.: "document.title", "document.querySelectorAll(\'a\').length", "getComputedStyle(document.body).backgroundColor". Para várias linhas, use uma IIFE: "(()=>{ ...; return v })()".',
    inputSchema: {
      type: 'object',
      required: ['expression'],
      properties: {
        expression: { type: 'string', description: 'Expressão JS cujo valor será retornado.' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const r = await opEval(str(args.expression), num(args.targetId));
      return [textBlock(r.ok ? (r.value ?? 'undefined') : `Erro: ${r.error}`)];
    },
  },
  {
    name: 'browser_read_console',
    description: 'Lê as mensagens recentes do console da página (logs e erros), capturadas pelo navegador interno. Útil para depurar erros de runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        onlyErrors: { type: 'boolean', description: 'Se true, retorna só erros/avisos (nível ≥ 2).' },
        ...TARGET_PROP,
      },
    },
    async handler(args) {
      const minLevel = args.onlyErrors === true ? 2 : 0;
      const msgs = opReadConsole(num(args.targetId), minLevel);
      if (msgs.length === 0) return [textBlock('Console vazio (nenhuma mensagem capturada desde o último carregamento).')];
      const lines = msgs.map((m) => {
        const tag = m.level >= 3 ? 'ERROR' : m.level === 2 ? 'WARN' : 'LOG';
        return `[${tag}] ${m.message}${m.source ? ` (${m.source.split('/').pop()}:${m.line})` : ''}`;
      });
      return [textBlock(lines.join('\n'))];
    },
  },
];

// ===========================================================================
// JSON-RPC handling
// ===========================================================================

interface RpcMessage { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleMessage(msg: RpcMessage): Promise<object | null> {
  const { method, id } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: str(msg.params?.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'voltz-browser', version: safeVersion() },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notificação — sem resposta
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const name = str(msg.params?.name);
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Ferramenta desconhecida: ${name}`);
      const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const content = await tool.handler(args);
        return rpcResult(id, { content });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return rpcResult(id, { content: [textBlock(`Erro: ${message}`)], isError: true });
      }
    }
    default:
      if (isNotification) return null;
      return rpcError(id, -32601, `Método não suportado: ${method}`);
  }
}

function safeVersion(): string {
  try { return app.getVersion(); } catch { return '0.0.0'; }
}

// ===========================================================================
// HTTP server
// ===========================================================================

export interface McpServerInfo { port: number; token: string; url: string }

let started: McpServerInfo | null = null;

export function getMcpServerInfo(): McpServerInfo | null { return started; }

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5_000_000) { reject(new Error('payload grande demais')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Sobe o servidor MCP em 127.0.0.1 numa porta efêmera. Idempotente. */
export function startBrowserMcpServer(): Promise<McpServerInfo> {
  if (started) return Promise.resolve(started);
  const token = crypto.randomBytes(24).toString('hex');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Só aceita conexões locais (defesa extra além do bind).
      const remote = req.socket.remoteAddress ?? '';
      if (!remote.includes('127.0.0.1') && remote !== '::1' && !remote.endsWith(':127.0.0.1')) {
        res.writeHead(403).end(); return;
      }
      const url = req.url ?? '/';
      if (!url.startsWith('/mcp')) { res.writeHead(404).end(); return; }

      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${token}`) { res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify(rpcError(null, -32001, 'unauthorized'))); return; }

      if (req.method === 'GET' || req.method === 'DELETE') {
        // Modo stateless: sem stream server→client e sem sessão.
        res.writeHead(req.method === 'DELETE' ? 200 : 405).end();
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }

      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as RpcMessage | RpcMessage[];
        const messages = Array.isArray(parsed) ? parsed : [parsed];
        const responses: object[] = [];
        for (const m of messages) {
          const r = await handleMessage(m);
          if (r) responses.push(r);
        }
        if (responses.length === 0) { res.writeHead(202).end(); return; }
        const payload = Array.isArray(parsed) ? responses : responses[0];
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify(rpcError(null, -32700, message)));
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      started = { port, token, url: `http://127.0.0.1:${port}/mcp` };
      resolve(started);
    });
  });
}
