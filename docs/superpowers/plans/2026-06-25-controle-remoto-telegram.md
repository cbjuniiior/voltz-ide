# Controle remoto via Telegram — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Controlar o Claude Code de projetos específicos pelo celular (Telegram): mandar prompts, ler respostas e aprovar/negar ações — espelhando a sessão Claude já aberta no app.

**Architecture:** Tudo no processo principal do Electron. Um `telegramBridge` (long-polling, conexão de saída) roteia comandos; `claudeWatch` detecta estado (rodando/aprovação/ocioso) grampeando o stream dos PTYs; `sessionTailer` extrai texto limpo do `.jsonl` da sessão; injeção de prompt/teclas via `ptyManager`. Config remota persistida em chaves próprias do electron-store, exposta por `IpcApi.remote` e uma categoria "Remoto" nas Configurações.

**Tech Stack:** Electron 29 (main CommonJS), Node `fetch` (sem libs de Telegram), node-pty, electron-store, React/Zustand (renderer), vitest (novo, para lógica pura), TypeScript.

**Notas de execução:**
- Verificação de tipos: `npx tsc --noEmit -p tsconfig.json` (renderer) e `npx tsc --noEmit -p tsconfig.electron.json` (main). Rodar com `$env:ELECTRON_RUN_AS_NODE=$null` no PowerShell.
- Commits: os passos incluem `git add <arquivos> && git commit`. O repo ainda não tem commit inicial e tem muitos arquivos untracked — **commitar apenas os arquivos citados** (commit parcial é ok) ou pular os passos de commit conforme o fluxo do dono. Não rodar `git add -A`.
- O renderer cria cada PTY com `cwd = projectPath` (ver `src/components/TerminalPane.tsx`), então **`cwd` do PTY identifica o projeto**.

---

## Estrutura de arquivos

| Arquivo | Novo/Mod | Responsabilidade |
|---|---|---|
| `vitest.config.ts` | Novo | Config do runner de testes (só `electron/services/**` puros). |
| `electron/services/ptyManager.ts` | Mod | + `cwd` por PTY, + `ptyEvents` (EventEmitter), + `getPtyCwd`/`listPtys`. |
| `electron/services/appStore.ts` | Novo | Singleton do electron-store `voltz-ide` (compartilhado). |
| `electron/ipc/store.ts` | Mod | Usar o singleton de `appStore.ts`. |
| `electron/services/remote/detect.ts` | Novo | Lógica pura: `stripAnsi`, `classifyChunk`. |
| `electron/services/remote/detect.test.ts` | Novo | Testes de `detect.ts`. |
| `electron/services/remote/sessionParse.ts` | Novo | Lógica pura: `parseSessionLines`. |
| `electron/services/remote/sessionParse.test.ts` | Novo | Testes de `sessionParse.ts`. |
| `electron/services/remote/messages.ts` | Novo | Lógica pura: `sliceForTelegram`, `formatApprovalCard`. |
| `electron/services/remote/messages.test.ts` | Novo | Testes de `messages.ts`. |
| `electron/services/remote/pairing.ts` | Novo | Lógica pura: `generatePairingCode`, `isOwner`. |
| `electron/services/remote/pairing.test.ts` | Novo | Testes de `pairing.ts`. |
| `electron/services/remote/telegramApi.ts` | Novo | Cliente mínimo da Bot API (fetch). |
| `electron/services/remote/claudeWatch.ts` | Novo | `ClaudeWatcher`: estado por terminal (idle timer), buffer recente. |
| `electron/services/remote/sessionTailer.ts` | Novo | Localiza + tail do `.jsonl` da sessão do projeto. |
| `electron/services/remote/config.ts` | Novo | Ler/gravar config remota (`remote.*`) via `appStore`. |
| `electron/services/remote/telegramBridge.ts` | Novo | Orquestra tudo (long-poll, roteamento, cartões). |
| `electron/ipc/remote.ts` | Novo | `registerRemoteIpc` + push de status. |
| `electron/preload.ts` | Mod | + grupo `remote`. |
| `shared/types.ts` | Mod | + `IpcApi.remote` e tipos. |
| `electron/main.ts` | Mod | Construir/start/stop o bridge + registrar IPC. |
| `src/stores/remote.ts` | Novo | Store Zustand do estado remoto (renderer). |
| `src/components/SettingsModal.tsx` | Mod | + categoria "Remoto". |

---

## Task 0: Setup do vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `electron/services/remote/_smoke.test.ts` (temporário)

- [ ] **Step 1: Instalar o vitest**

Run: `npm i -D vitest@^2`
Expected: instala sem erro; aparece em devDependencies.

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['electron/services/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Adicionar script de teste em `package.json`** (na seção `scripts`, após `"build:icons"`)

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 4: Teste de fumaça**

`electron/services/remote/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('roda', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run electron/services/remote/_smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 6: Remover o smoke e commitar**

```bash
rm electron/services/remote/_smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-logic unit tests"
```

---

## Task 1: ptyManager — eventos centrais + cwd

Adiciona um `EventEmitter` central e guarda o `cwd` por PTY, sem mudar o comportamento atual (o `cb.onData`/`onExit` continuam funcionando).

**Files:**
- Modify: `electron/services/ptyManager.ts`

- [ ] **Step 1: Importar EventEmitter e estender o registro**

No topo de `electron/services/ptyManager.ts`, adicionar:
```ts
import { EventEmitter } from 'node:events';
```
Trocar a interface do registro (linhas ~6-9) para incluir `cwd`:
```ts
interface ManagedPty {
  id: string;
  pty: IPty;
  cwd: string;
}
```
Adicionar, logo após a declaração do `Map` (linha ~11):
```ts
/** Eventos centrais do PTY: qualquer módulo do main pode grampear o stream. */
export const ptyEvents = new EventEmitter();
```

- [ ] **Step 2: Emitir eventos e guardar cwd no createPty**

Dentro de `createPty`, onde hoje há `pty.onData((data) => cb.onData(opts.id, data))` (linha ~112), trocar por:
```ts
    pty.onData((data) => {
      cb.onData(opts.id, data);
      ptyEvents.emit('data', opts.id, data);
    });
```
Onde o PTY é registrado no Map, incluir o cwd:
```ts
    ptys.set(opts.id, { id: opts.id, pty, cwd: opts.cwd ?? '' });
```
Na saída (onExit), após `cb.onExit(...)`, emitir:
```ts
      ptyEvents.emit('exit', opts.id, code);
```
(manter a remoção do Map já existente).

- [ ] **Step 3: Adicionar getters**

No fim do arquivo, junto dos outros exports (`getPtyPid`, `listPtyIds`), adicionar:
```ts
export function getPtyCwd(id: string): string | undefined {
  return ptys.get(id)?.cwd;
}

export function listPtys(): { id: string; cwd: string }[] {
  return [...ptys.values()].map((m) => ({ id: m.id, cwd: m.cwd }));
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add electron/services/ptyManager.ts
git commit -m "feat(pty): central ptyEvents emitter + per-pty cwd"
```

---

## Task 2: detect.ts — classificação pura do stream

**Files:**
- Create: `electron/services/remote/detect.ts`
- Create: `electron/services/remote/detect.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

`electron/services/remote/detect.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stripAnsi, classifyChunk } from './detect';

describe('stripAnsi', () => {
  it('remove sequências CSI', () => {
    expect(stripAnsi('\x1b[31mhi\x1b[0m')).toBe('hi');
  });
});

describe('classifyChunk', () => {
  it('detecta atividade pelo spinner', () => {
    expect(classifyChunk('✻ Working…').activity).toBe(true);
  });
  it('detecta atividade por "esc to interrupt"', () => {
    expect(classifyChunk('… (esc to interrupt)').activity).toBe(true);
  });
  it('detecta aprovação por "1. Yes"', () => {
    expect(classifyChunk('❯ 1. Yes\n  2. No').approval).toBe(true);
  });
  it('detecta aprovação por (y/n)', () => {
    expect(classifyChunk('Proceed? (y/n)').approval).toBe(true);
  });
  it('texto comum não é atividade nem aprovação', () => {
    const r = classifyChunk('apenas um output normal');
    expect(r.activity).toBe(false);
    expect(r.approval).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/services/remote/detect.test.ts`
Expected: FAIL ("Cannot find module './detect'").

- [ ] **Step 3: Implementar `detect.ts`**

```ts
// Regexes portadas de src/components/TerminalPane.tsx (manter em sincronia).
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const CLAUDE_ACTIVITY_RE = /[✻✶✷✸✹✺●]|esc to interrupt/i;
const CLAUDE_APPROVAL_RE = /(?:Do you want to|Would you like to|❯\s*1\.\s*Yes|\n\s*1\.\s*Yes\b|\(y\/n\)|press\s+y\b|Esc to cancel)/i;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function classifyChunk(rawChunk: string): { activity: boolean; approval: boolean } {
  const text = stripAnsi(rawChunk);
  return {
    activity: CLAUDE_ACTIVITY_RE.test(text),
    approval: CLAUDE_APPROVAL_RE.test(text),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/services/remote/detect.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/services/remote/detect.ts electron/services/remote/detect.test.ts
git commit -m "feat(remote): pure chunk classifier (activity/approval)"
```

---

## Task 3: sessionParse.ts — extrair texto/ações do JSONL

Formato do JSONL do Claude Code: cada linha é um objeto com `type` (`'assistant'`, `'user'`, ...) e `message.content` (array). Itens de `assistant`: `{type:'text', text}` e `{type:'tool_use', name, input}`.

**Files:**
- Create: `electron/services/remote/sessionParse.ts`
- Create: `electron/services/remote/sessionParse.test.ts`

- [ ] **Step 1: Testes (falhando)**

`electron/services/remote/sessionParse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseSessionLines } from './sessionParse';

const lines = [
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'text', text: 'Vou editar o arquivo.' },
    { type: 'tool_use', name: 'Edit', input: { file_path: 'src/app.tsx' } },
  ] } }),
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
  ] } }),
  'linha-corrompida-não-json',
];

describe('parseSessionLines', () => {
  it('coleta o texto do assistant', () => {
    expect(parseSessionLines(lines).assistantText).toContain('Vou editar o arquivo.');
  });
  it('resume tool_use de Edit com o arquivo', () => {
    const s = parseSessionLines(lines).toolSummaries.join('\n');
    expect(s).toContain('Edit');
    expect(s).toContain('src/app.tsx');
  });
  it('resume tool_use de Bash com o comando', () => {
    const s = parseSessionLines(lines).toolSummaries.join('\n');
    expect(s).toContain('npm test');
  });
  it('ignora linhas que não são JSON', () => {
    expect(() => parseSessionLines(lines)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/services/remote/sessionParse.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `sessionParse.ts`**

```ts
export interface ParsedTurn {
  assistantText: string;
  toolSummaries: string[];
}

interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function summarizeTool(name: string, input: Record<string, unknown> = {}): string {
  const file = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  const cmd = input.command as string | undefined;
  const url = input.url as string | undefined;
  const detail = file ?? cmd ?? url ?? '';
  return detail ? `${name}: ${detail}` : name;
}

export function parseSessionLines(lines: string[]): ParsedTurn {
  const textParts: string[] = [];
  const toolSummaries: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: { type?: string; message?: { content?: ContentItem[] } };
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj.type !== 'assistant') continue;
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        textParts.push(item.text);
      } else if (item.type === 'tool_use' && typeof item.name === 'string') {
        toolSummaries.push(summarizeTool(item.name, item.input));
      }
    }
  }
  return { assistantText: textParts.join('\n\n').trim(), toolSummaries };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/services/remote/sessionParse.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/services/remote/sessionParse.ts electron/services/remote/sessionParse.test.ts
git commit -m "feat(remote): pure JSONL session parser"
```

---

## Task 4: messages.ts — fatiar e formatar

**Files:**
- Create: `electron/services/remote/messages.ts`
- Create: `electron/services/remote/messages.test.ts`

- [ ] **Step 1: Testes (falhando)**

`electron/services/remote/messages.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sliceForTelegram, formatApprovalCard } from './messages';

describe('sliceForTelegram', () => {
  it('texto curto vira 1 pedaço', () => {
    expect(sliceForTelegram('oi', 4096)).toEqual(['oi']);
  });
  it('texto longo é fatiado dentro do limite', () => {
    const parts = sliceForTelegram('a'.repeat(10000), 4096);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
  });
  it('string vazia vira lista vazia', () => {
    expect(sliceForTelegram('', 4096)).toEqual([]);
  });
});

describe('formatApprovalCard', () => {
  it('inclui o projeto e o alvo', () => {
    const s = formatApprovalCard('meu-app', 'Bash: rm -rf dist');
    expect(s).toContain('meu-app');
    expect(s).toContain('rm -rf dist');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/services/remote/messages.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `messages.ts`**

```ts
export function sliceForTelegram(text: string, max = 4096): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    out.push(text.slice(i, i + max));
  }
  return out;
}

export function formatApprovalCard(projectName: string, target: string): string {
  return `🔐 *${projectName}* — o Claude quer:\n\`${target}\``;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/services/remote/messages.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/services/remote/messages.ts electron/services/remote/messages.test.ts
git commit -m "feat(remote): message slicing + approval card formatter"
```

---

## Task 5: pairing.ts — código e dono

**Files:**
- Create: `electron/services/remote/pairing.ts`
- Create: `electron/services/remote/pairing.test.ts`

- [ ] **Step 1: Testes (falhando)**

`electron/services/remote/pairing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generatePairingCode, isOwner } from './pairing';

describe('generatePairingCode', () => {
  it('gera 6 dígitos', () => {
    expect(generatePairingCode()).toMatch(/^\d{6}$/);
  });
});

describe('isOwner', () => {
  it('true quando bate o chatId', () => {
    expect(isOwner('123', '123')).toBe(true);
  });
  it('false quando difere', () => {
    expect(isOwner('123', '999')).toBe(false);
  });
  it('false quando não há dono', () => {
    expect(isOwner('123', null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/services/remote/pairing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `pairing.ts`**

```ts
export function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isOwner(chatId: string | number, ownerChatId: string | null): boolean {
  if (!ownerChatId) return false;
  return String(chatId) === String(ownerChatId);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/services/remote/pairing.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/services/remote/pairing.ts electron/services/remote/pairing.test.ts
git commit -m "feat(remote): pairing code + owner check"
```

---

## Task 6: appStore singleton + refactor store.ts

Evita dois `Store` se sobrescreverem (cada `set` regrava o arquivo inteiro).

**Files:**
- Create: `electron/services/appStore.ts`
- Modify: `electron/ipc/store.ts`

- [ ] **Step 1: Criar o singleton**

`electron/services/appStore.ts`:
```ts
import Store from 'electron-store';

/** Instância única do electron-store. TODOS os módulos do main devem usar esta. */
export const appStore = new Store({ name: 'voltz-ide' }) as unknown as {
  get: (k: string) => unknown;
  set: (k: string, v: unknown) => void;
  delete: (k: string) => void;
};
```

- [ ] **Step 2: Refatorar `electron/ipc/store.ts` para usar o singleton**

Trocar `const store = new Store({ name: 'voltz-ide' });` por:
```ts
import { appStore as store } from '../services/appStore';
```
e remover o `import Store from 'electron-store';` (não mais necessário). Manter o resto (`store:get`/`store:set`/broadcast) igual.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add electron/services/appStore.ts electron/ipc/store.ts
git commit -m "refactor(store): shared electron-store singleton"
```

---

## Task 7: config.ts — persistência da config remota

**Files:**
- Create: `electron/services/remote/config.ts`

- [ ] **Step 1: Implementar**

```ts
import { appStore } from '../appStore';

export interface RemoteConfig {
  enabled: boolean;
  token: string | null;
  ownerChatId: string | null;
  projects: string[]; // paths habilitados
}

const KEY = 'remote';

export function getRemoteConfig(): RemoteConfig {
  const raw = (appStore.get(KEY) as Partial<RemoteConfig>) ?? {};
  return {
    enabled: raw.enabled ?? false,
    token: raw.token ?? null,
    ownerChatId: raw.ownerChatId ?? null,
    projects: raw.projects ?? [],
  };
}

export function setRemoteConfig(patch: Partial<RemoteConfig>): RemoteConfig {
  const next = { ...getRemoteConfig(), ...patch };
  appStore.set(KEY, next);
  return next;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add electron/services/remote/config.ts
git commit -m "feat(remote): remote config persistence (separate store key)"
```

---

## Task 8: telegramApi.ts — cliente mínimo da Bot API

Usa `fetch` global (Electron 29 expõe). Sem dependências externas.

**Files:**
- Create: `electron/services/remote/telegramApi.ts`

- [ ] **Step 1: Implementar**

```ts
interface InlineButton { text: string; callback_data: string }

export interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
}

export class TelegramApi {
  constructor(private token: string) {}

  private base() { return `https://api.telegram.org/bot${this.token}`; }

  private async call<T>(method: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(json.description || `Telegram ${method} falhou`);
    return json.result as T;
  }

  getMe(): Promise<{ id: number; username: string }> {
    return this.call('getMe');
  }

  getUpdates(offset: number, timeoutSec = 30): Promise<TgUpdate[]> {
    return this.call('getUpdates', { offset, timeout: timeoutSec });
  }

  sendMessage(chatId: number | string, text: string, buttons?: InlineButton[][]): Promise<{ message_id: number }> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  editMessageText(chatId: number | string, messageId: number, text: string): Promise<unknown> {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' });
  }

  answerCallbackQuery(id: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: id, text });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros. (Se acusar `fetch` desconhecido, garantir `"lib": ["ES2022"]`/`"dom"` ou `@types/node` recente no tsconfig.electron — verificar `tsconfig.electron.json` e adicionar `"DOM"` em `lib` se faltar.)

- [ ] **Step 3: Commit**

```bash
git add electron/services/remote/telegramApi.ts
git commit -m "feat(remote): minimal Telegram Bot API client (fetch)"
```

---

## Task 9: claudeWatch.ts — estado por terminal

**Files:**
- Create: `electron/services/remote/claudeWatch.ts`

- [ ] **Step 1: Implementar**

```ts
import { EventEmitter } from 'node:events';
import { ptyEvents, getPtyCwd } from '../ptyManager';
import { classifyChunk } from './detect';

export type ClaudeState = 'running' | 'approval' | 'idle';
const IDLE_MS = 1800;
const BUFFER_MAX = 4000;

interface TermState {
  state: ClaudeState;
  buffer: string;       // texto recente (já sem ANSI) p/ extrair alvo de aprovação
  idleTimer?: NodeJS.Timeout;
}

/** Observa o stream dos PTYs e emite `status` { id, cwd, state }. */
export class ClaudeWatcher extends EventEmitter {
  private terms = new Map<string, TermState>();

  start() {
    ptyEvents.on('data', this.onData);
    ptyEvents.on('exit', this.onExit);
  }
  stop() {
    ptyEvents.off('data', this.onData);
    ptyEvents.off('exit', this.onExit);
    for (const t of this.terms.values()) if (t.idleTimer) clearTimeout(t.idleTimer);
    this.terms.clear();
  }

  getState(id: string): ClaudeState | null { return this.terms.get(id)?.state ?? null; }
  getRecentText(id: string): string { return this.terms.get(id)?.buffer ?? ''; }

  private onData = (id: string, data: string) => {
    const { activity, approval } = classifyChunk(data);
    let t = this.terms.get(id);
    if (!t) { t = { state: 'idle', buffer: '' }; this.terms.set(id, t); }
    // buffer recente (sem ANSI) limitado
    t.buffer = (t.buffer + data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')).slice(-BUFFER_MAX);

    if (approval) { this.setState(id, t, 'approval'); return; }
    if (activity) {
      this.setState(id, t, 'running');
      if (t.idleTimer) clearTimeout(t.idleTimer);
      t.idleTimer = setTimeout(() => this.setState(id, t!, 'idle'), IDLE_MS);
    }
  };

  private onExit = (id: string) => {
    const t = this.terms.get(id);
    if (t?.idleTimer) clearTimeout(t.idleTimer);
    this.terms.delete(id);
  };

  private setState(id: string, t: TermState, state: ClaudeState) {
    if (t.state === state) return;
    t.state = state;
    this.emit('status', { id, cwd: getPtyCwd(id) ?? '', state });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add electron/services/remote/claudeWatch.ts
git commit -m "feat(remote): per-terminal Claude state watcher"
```

---

## Task 10: sessionTailer.ts — tail do JSONL da sessão

**Files:**
- Create: `electron/services/remote/sessionTailer.ts`

- [ ] **Step 1: Implementar**

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sessionsInDir } from '../claudeSessions';
import { parseSessionLines, type ParsedTurn } from './sessionParse';

// Conta padrão do Claude. (Multi-conta fica para depois — o MVP usa ~/.claude.)
const CONFIG_DIR = path.join(os.homedir(), '.claude');

/** Acompanha o .jsonl mais recente de um projeto e devolve as linhas novas. */
export class SessionTailer {
  private file: string | null = null;
  private offset = 0;

  constructor(private projectPath: string) {}

  /** Resolve o .jsonl de sessão mais recente do projeto. `sessionsInDir`
   *  retorna `{ id, file, mtimeMs }[]` (ver claudeSessions.ts:236). */
  private async resolveFile(): Promise<string | null> {
    try {
      const sessions = await sessionsInDir(CONFIG_DIR, this.projectPath);
      if (!sessions.length) return null;
      const newest = sessions.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a));
      return newest.file;
    } catch { return null; }
  }

  /** Lê o que foi acrescentado desde a última chamada e parseia. */
  async poll(): Promise<ParsedTurn | null> {
    if (!this.file) {
      this.file = await this.resolveFile();
      if (!this.file) return null;
      const stat = await fs.stat(this.file).catch(() => null);
      this.offset = stat?.size ?? 0; // começa do fim: só interessa o que vier depois
      return null;
    }
    const stat = await fs.stat(this.file).catch(() => null);
    if (!stat || stat.size <= this.offset) return null;
    const fh = await fs.open(this.file, 'r');
    try {
      const len = stat.size - this.offset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, this.offset);
      this.offset = stat.size;
      const lines = buf.toString('utf8').split('\n');
      const parsed = parseSessionLines(lines);
      return (parsed.assistantText || parsed.toolSummaries.length) ? parsed : null;
    } finally {
      await fh.close();
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add electron/services/remote/sessionTailer.ts
git commit -m "feat(remote): tail latest Claude session JSONL per project"
```

---

## Task 11: telegramBridge.ts — orquestração

**Files:**
- Create: `electron/services/remote/telegramBridge.ts`

- [ ] **Step 1: Implementar o esqueleto + loop + roteamento**

```ts
import { TelegramApi, type TgUpdate } from './telegramApi';
import { ClaudeWatcher, type ClaudeState } from './claudeWatch';
import { SessionTailer } from './sessionTailer';
import { getRemoteConfig, setRemoteConfig } from './config';
import { isOwner, generatePairingCode } from './pairing';
import { sliceForTelegram, formatApprovalCard } from './messages';
import { listPtys, writePty } from '../ptyManager';
import type { RemoteStatusInfo } from '../../../shared/types';

function norm(p: string) { return p.replace(/[\\/]+$/, '').toLowerCase(); }
function baseName(p: string) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

export class TelegramBridge {
  private api: TelegramApi | null = null;
  private offset = 0;
  private polling = false;
  private botUsername: string | null = null;
  private error: string | undefined;
  private pairingCode: string | null = null;
  private activeProject: string | null = null;   // projeto ativo da conversa (1 chat)
  private tailers = new Map<string, SessionTailer>();
  private approvalMsg = new Map<string, number>(); // projectPath -> telegram message_id do cartão
  private watcher = new ClaudeWatcher();
  private tailTimer?: NodeJS.Timeout;

  constructor(private onStatusChange: () => void) {}

  status(): RemoteStatusInfo {
    const cfg = getRemoteConfig();
    return { running: this.polling, botUsername: this.botUsername, paired: !!cfg.ownerChatId, pairingCode: this.pairingCode, error: this.error };
  }

  generatePairing(): string { this.pairingCode = generatePairingCode(); this.onStatusChange(); return this.pairingCode; }

  async start() {
    const cfg = getRemoteConfig();
    if (!cfg.enabled || !cfg.token) return;
    this.api = new TelegramApi(cfg.token);
    try {
      const me = await this.api.getMe();
      this.botUsername = me.username; this.error = undefined;
    } catch (e) { this.error = (e as Error).message; this.onStatusChange(); return; }
    this.watcher.start();
    this.watcher.on('status', this.onClaudeStatus);
    this.polling = true;
    this.onStatusChange();
    void this.loop();
    this.tailTimer = setInterval(() => void this.pollTailers(), 1000);
  }

  stop() {
    this.polling = false;
    this.watcher.off('status', this.onClaudeStatus);
    this.watcher.stop();
    if (this.tailTimer) clearInterval(this.tailTimer);
    this.api = null; this.botUsername = null;
    this.onStatusChange();
  }

  private async loop() {
    while (this.polling && this.api) {
      try {
        const updates = await this.api.getUpdates(this.offset, 30);
        for (const u of updates) { this.offset = u.update_id + 1; await this.handleUpdate(u); }
      } catch (e) {
        this.error = (e as Error).message;
        await new Promise((r) => setTimeout(r, 3000)); // backoff
      }
    }
  }

  private send(chatId: number | string, text: string, buttons?: { text: string; callback_data: string }[][]) {
    if (!this.api) return;
    return this.api.sendMessage(chatId, text, buttons).catch(() => {});
  }

  // ---- roteamento de mensagens ----
  private async handleUpdate(u: TgUpdate) {
    const cfg = getRemoteConfig();
    if (u.callback_query) return this.handleCallback(u, cfg.ownerChatId);
    const msg = u.message; if (!msg?.text) return;
    const chatId = msg.chat.id; const text = msg.text.trim();

    // pareamento
    if (text.startsWith('/pair')) {
      const code = text.split(/\s+/)[1];
      if (this.pairingCode && code === this.pairingCode) {
        setRemoteConfig({ ownerChatId: String(chatId) });
        this.pairingCode = null; this.onStatusChange();
        return void this.send(chatId, '✅ Pareado! Use /projects para começar.');
      }
      return void this.send(chatId, '❌ Código inválido. Gere um novo no app (Configurações → Remoto).');
    }
    if (!isOwner(chatId, getRemoteConfig().ownerChatId)) return; // ignora estranhos

    if (text === '/start') return void this.send(chatId, 'Voltz IDE remoto. /projects para escolher um projeto.');
    if (text === '/projects' || text === '/p') return this.sendProjectList(chatId);
    if (text === '/status') return this.sendStatus(chatId);
    if (text === '/stop') return this.injectActive('\x1b'); // Esc

    // texto solto = prompt p/ o projeto ativo
    if (!this.activeProject) return void this.send(chatId, 'Escolha um projeto primeiro: /projects');
    const ptyId = this.ptyForProject(this.activeProject);
    if (!ptyId) return void this.send(chatId, 'Nenhuma sessão Claude aberta nesse projeto. Abra/rode o Claude no app.');
    writePty(ptyId, text + '\r');
    void this.send(chatId, '⏳ Enviado…');
  }

  private async handleCallback(u: TgUpdate, ownerChatId: string | null) {
    const cq = u.callback_query!; const chatId = cq.message?.chat.id;
    if (!chatId || !isOwner(chatId, ownerChatId)) return;
    const [action, project] = (cq.data ?? '').split('|');
    if (action === 'approve' || action === 'deny') {
      const ptyId = this.ptyForProject(project);
      if (ptyId) writePty(ptyId, action === 'approve' ? '1\r' : '\x1b');
      await this.api?.answerCallbackQuery(cq.id, action === 'approve' ? 'Aprovado' : 'Negado');
      const mid = this.approvalMsg.get(project);
      if (mid) this.api?.editMessageText(chatId, mid, action === 'approve' ? '✅ Aprovado' : '❌ Negado').catch(() => {});
      this.approvalMsg.delete(project);
    } else if (action === 'pick') {
      this.activeProject = project;
      await this.api?.answerCallbackQuery(cq.id, `Ativo: ${baseName(project)}`);
      void this.send(chatId, `Projeto ativo: *${baseName(project)}*. Mande seu pedido.`);
    }
  }

  // ---- helpers ----
  private ptyForProject(projectPath: string): string | undefined {
    const cands = listPtys().filter((p) => norm(p.cwd) === norm(projectPath));
    // prefere o que está rodando Claude
    const claude = cands.find((p) => this.watcher.getState(p.id) !== null);
    return (claude ?? cands[0])?.id;
  }
  private injectActive(seq: string) {
    if (!this.activeProject) return;
    const id = this.ptyForProject(this.activeProject); if (id) writePty(id, seq);
  }
  private sendProjectList(chatId: number) {
    const cfg = getRemoteConfig();
    if (!cfg.projects.length) return void this.send(chatId, 'Nenhum projeto habilitado. Marque projetos em Configurações → Remoto.');
    const buttons = cfg.projects.map((p) => [{ text: baseName(p), callback_data: `pick|${p}` }]);
    void this.send(chatId, 'Escolha um projeto:', buttons);
  }
  private sendStatus(chatId: number) {
    const cfg = getRemoteConfig();
    const lines = cfg.projects.map((p) => {
      const id = this.ptyForProject(p); const st = id ? this.watcher.getState(id) : null;
      return `• ${baseName(p)}: ${st ?? 'sem sessão'}`;
    });
    void this.send(chatId, lines.join('\n') || 'Nada habilitado.');
  }

  // ---- eventos do Claude ----
  private onClaudeStatus = ({ cwd, state }: { id: string; cwd: string; state: ClaudeState }) => {
    const cfg = getRemoteConfig();
    if (!cfg.ownerChatId) return;
    const project = cfg.projects.find((p) => norm(p) === norm(cwd));
    if (!project) return;
    if (state === 'approval') {
      const id = this.ptyForProject(project);
      const recent = id ? this.watcher.getRecentText(id).split('\n').filter(Boolean).slice(-4).join(' ').slice(-200) : '';
      const card = formatApprovalCard(baseName(project), recent || 'ação pendente');
      this.api?.sendMessage(cfg.ownerChatId, card, [[
        { text: '✅ Aprovar', callback_data: `approve|${project}` },
        { text: '❌ Negar', callback_data: `deny|${project}` },
      ]]).then((m) => this.approvalMsg.set(project, m.message_id)).catch(() => {});
    }
  };

  // ---- tail das sessões (texto das respostas) ----
  private async pollTailers() {
    const cfg = getRemoteConfig();
    if (!cfg.ownerChatId) return;
    for (const project of cfg.projects) {
      let tailer = this.tailers.get(project);
      if (!tailer) { tailer = new SessionTailer(project); this.tailers.set(project, tailer); }
      const turn = await tailer.poll();
      if (!turn) continue;
      const tools = turn.toolSummaries.length ? '\n\n_' + turn.toolSummaries.map((t) => '▸ ' + t).join('\n') + '_' : '';
      const full = (turn.assistantText + tools).trim();
      if (full) for (const chunk of sliceForTelegram(full)) await this.send(cfg.ownerChatId, chunk);
    }
  }
}
```

> **Nota de execução:** este arquivo amarra tudo. Ao implementar, garantir que os imports/usos batem com as assinaturas das tasks anteriores (`listPtys`, `writePty`, `ClaudeWatcher.getState/getRecentText`, `SessionTailer.poll`, `getRemoteConfig`). Remover imports não usados que o `tsc` acusar.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Expected: sem erros (ajustar imports não usados se necessário).

- [ ] **Step 3: Commit**

```bash
git add electron/services/remote/telegramBridge.ts
git commit -m "feat(remote): Telegram bridge orchestration"
```

---

## Task 12: IPC `remote` + tipos + preload + main

**Files:**
- Create: `electron/ipc/remote.ts`
- Modify: `shared/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: `shared/types.ts` — tipos**

Adicionar ao `IpcApi` (junto de `system`/`devPorts`):
```ts
  remote: {
    status: () => Promise<RemoteStatusInfo>;
    setToken: (token: string | null) => Promise<{ ok: boolean; botUsername?: string; error?: string }>;
    setEnabled: (on: boolean) => Promise<void>;
    setProjectEnabled: (projectPath: string, on: boolean) => Promise<void>;
    listProjectsEnabled: () => Promise<string[]>;
    generatePairingCode: () => Promise<string>;
    unpair: () => Promise<void>;
    onStatus: (cb: (s: RemoteStatusInfo) => void) => () => void;
  };
```
E o tipo (perto dos outros tipos exportados):
```ts
export interface RemoteStatusInfo {
  running: boolean;
  botUsername: string | null;
  paired: boolean;
  pairingCode: string | null;
  error?: string;
}
```

- [ ] **Step 2: `electron/ipc/remote.ts`**

```ts
import { ipcMain, BrowserWindow } from 'electron';
import type { TelegramBridge } from '../services/remote/telegramBridge';
import { getRemoteConfig, setRemoteConfig } from '../services/remote/config';
import { TelegramApi } from '../services/remote/telegramApi';

export function registerRemoteIpc(getBridge: () => TelegramBridge, getWin: () => BrowserWindow | null) {
  ipcMain.handle('remote:status', () => getBridge().status());

  ipcMain.handle('remote:setToken', async (_e, token: string | null) => {
    setRemoteConfig({ token });
    if (!token) { getBridge().stop(); return { ok: true }; }
    try {
      const me = await new TelegramApi(token).getMe();
      return { ok: true, botUsername: me.username };
    } catch (err) { return { ok: false, error: (err as Error).message }; }
  });

  ipcMain.handle('remote:setEnabled', async (_e, on: boolean) => {
    setRemoteConfig({ enabled: on });
    if (on) await getBridge().start(); else getBridge().stop();
  });

  ipcMain.handle('remote:setProjectEnabled', (_e, projectPath: string, on: boolean) => {
    const cur = getRemoteConfig().projects;
    const next = on ? [...new Set([...cur, projectPath])] : cur.filter((p) => p !== projectPath);
    setRemoteConfig({ projects: next });
  });

  ipcMain.handle('remote:listProjectsEnabled', () => getRemoteConfig().projects);
  ipcMain.handle('remote:generatePairingCode', () => getBridge().generatePairing());
  ipcMain.handle('remote:unpair', () => { setRemoteConfig({ ownerChatId: null }); });

  // push de status para a UI de Config
  void getWin;
}
```

- [ ] **Step 3: `electron/preload.ts` — grupo remote**

Após `system: { ... }`, adicionar:
```ts
  remote: {
    status: () => ipcRenderer.invoke('remote:status'),
    setToken: (token: string | null) => ipcRenderer.invoke('remote:setToken', token),
    setEnabled: (on: boolean) => ipcRenderer.invoke('remote:setEnabled', on),
    setProjectEnabled: (p: string, on: boolean) => ipcRenderer.invoke('remote:setProjectEnabled', p, on),
    listProjectsEnabled: () => ipcRenderer.invoke('remote:listProjectsEnabled'),
    generatePairingCode: () => ipcRenderer.invoke('remote:generatePairingCode'),
    unpair: () => ipcRenderer.invoke('remote:unpair'),
    onStatus: (cb) => {
      const listener = (_: unknown, s: import('../shared/types').RemoteStatusInfo) => cb(s);
      ipcRenderer.on('remote:status', listener);
      return () => ipcRenderer.removeListener('remote:status', listener);
    },
  },
```

- [ ] **Step 4: `electron/main.ts` — construir + registrar + start/stop**

No topo, importar:
```ts
import { TelegramBridge } from './services/remote/telegramBridge';
import { registerRemoteIpc } from './ipc/remote';
```
Após os outros `registerXxxIpc()` (linha ~314), antes de `createWindow()`:
```ts
  const remoteBridge = new TelegramBridge(() => {
    const win = mainWindow;
    if (win && !win.webContents.isDestroyed()) win.webContents.send('remote:status', remoteBridge.status());
  });
  registerRemoteIpc(() => remoteBridge, () => mainWindow);
  void remoteBridge.start(); // só sobe se enabled+token na config
```
Em `before-quit` (linha ~353) e `window-all-closed` (linha ~347), adicionar:
```ts
  remoteBridge.stop();
```

- [ ] **Step 5: Type-check (renderer + main)**

Run: `npx tsc --noEmit -p tsconfig.electron.json`
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: ambos sem erros.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/remote.ts electron/preload.ts shared/types.ts electron/main.ts
git commit -m "feat(remote): IPC bridge wiring (main + preload + types)"
```

---

## Task 13: UI — store + categoria "Remoto" nas Configurações

**Files:**
- Create: `src/stores/remote.ts`
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: `src/stores/remote.ts`**

```ts
import { create } from 'zustand';
import type { RemoteStatusInfo } from '@shared/types';

interface RemoteStore {
  status: RemoteStatusInfo;
  projectsEnabled: string[];
  refresh: () => Promise<void>;
  init: () => () => void;
}

const EMPTY: RemoteStatusInfo = { running: false, botUsername: null, paired: false, pairingCode: null };

export const useRemoteStore = create<RemoteStore>((set, get) => ({
  status: EMPTY,
  projectsEnabled: [],
  async refresh() {
    const [status, projectsEnabled] = await Promise.all([
      window.api.remote.status(),
      window.api.remote.listProjectsEnabled(),
    ]);
    set({ status, projectsEnabled });
  },
  init() {
    void get().refresh();
    return window.api.remote.onStatus((status) => set({ status }));
  },
}));
```

- [ ] **Step 2: `SettingsModal.tsx` — registrar a categoria**

Em `CATS`, adicionar (importar `Smartphone` do lucide):
```ts
  { id: 'remote', label: 'Remoto', icon: Smartphone, desc: 'Controle o Claude pelo celular via bot do Telegram.' },
```
Adicionar o painel no corpo (junto dos outros `active === '...'`):
```tsx
            {active === 'remote' && <RemotePanel />}
```

- [ ] **Step 3: `SettingsModal.tsx` — componente `RemotePanel`**

Adicionar no fim do arquivo:
```tsx
function RemotePanel() {
  const { status, projectsEnabled, init, refresh } = useRemoteStore();
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const [token, setToken] = useState('');

  useEffect(() => { const off = init(); return off; }, [init]);

  async function saveToken() {
    const r = await window.api.remote.setToken(token.trim() || null);
    if (!r.ok) toast.error('Token inválido', r.error);
    else { toast.success('Bot conectado', r.botUsername ? `@${r.botUsername}` : undefined); await window.api.remote.setEnabled(true); await refresh(); }
  }
  async function pair() { const code = await window.api.remote.generatePairingCode(); await refresh(); toast.info('Código de pareamento', `Envie no Telegram: /pair ${code}`); }
  async function toggleProject(path: string, on: boolean) { await window.api.remote.setProjectEnabled(path, on); await refresh(); }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-subtle bg-bg-base px-3.5 py-3 text-[11.5px] leading-relaxed text-text-tertiary">
        Crie um bot no Telegram com <span className="font-medium text-text-secondary">@BotFather</span> → <code className="text-text-secondary">/newbot</code> → cole o token aqui.
      </div>
      <Field label="Token do bot">
        <div className="flex gap-2">
          <Input type="password" value={token} onChange={setToken} placeholder="123456:ABC-…" />
          <button onClick={() => void saveToken()} className="shrink-0 rounded-lg px-3 text-[12px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Salvar</button>
        </div>
      </Field>
      <SettingRow title="Status" desc={status.error ?? (status.botUsername ? `Conectado como @${status.botUsername}` : 'Sem bot configurado')}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.running ? 'var(--success)' : 'var(--text-disabled)' }} />
      </SettingRow>
      <SettingRow title="Pareamento" desc={status.paired ? 'Pareado com seu celular ✓' : (status.pairingCode ? `Envie no bot: /pair ${status.pairingCode}` : 'Não pareado')}>
        {status.paired
          ? <button onClick={() => { void window.api.remote.unpair().then(refresh); }} className="rounded-lg border border-border-subtle px-2.5 py-1 text-[11px] text-text-secondary hover:border-danger hover:text-danger">Desparear</button>
          : <button onClick={() => void pair()} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Gerar código</button>}
      </SettingRow>
      <div>
        <label className="mb-1.5 block text-[11.5px] font-medium text-text-secondary">Projetos com acesso remoto</label>
        <div className="space-y-1.5">
          {projects.map((p) => {
            const on = projectsEnabled.includes(p.path);
            const name = selectCustom(customs, p.path).alias || p.name;
            return (
              <SettingRow key={p.id} title={name} desc={undefined}>
                <Toggle checked={on} onChange={(v) => void toggleProject(p.path, v)} />
              </SettingRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```
Garantir imports no topo de `SettingsModal.tsx`: `Smartphone` (lucide), `useEffect`/`useState` (já há), `useRemoteStore` (`@/stores/remote`), `useProjectsStore` (`@/stores/projects`), `useProjectCustomStore`/`selectCustom` (`@/stores/projectCustom`), `toast` (`@/stores/toasts`). (`Field`, `Input`, `SettingRow`, `Toggle` já existem no arquivo.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros (ajustar imports).

- [ ] **Step 5: Commit**

```bash
git add src/stores/remote.ts src/components/SettingsModal.tsx
git commit -m "feat(remote): Settings 'Remoto' category + remote store"
```

---

## Task 14: Verificação end-to-end (manual)

**Files:** nenhum (teste de aceitação).

- [ ] **Step 1: Rodar todos os testes unitários**

Run: `npx vitest run`
Expected: todas as suítes passam (detect, sessionParse, messages, pairing).

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.electron.json`
Expected: ambos sem erros.

- [ ] **Step 3: Subir o app**

Run: `npm run dev`
Criar um bot com @BotFather, colar o token em Configurações → **Remoto** → Salvar. Conferir "Conectado como @SeuBot".

- [ ] **Step 4: Parear**

Clicar "Gerar código" → enviar `/pair <código>` ao bot no celular → ver "✅ Pareado!" no Telegram e "Pareado ✓" no app.

- [ ] **Step 5: Habilitar um projeto e abrir o Claude**

Marcar um projeto no toggle. No app, abrir um terminal nesse projeto e rodar o Claude. No Telegram: `/projects` → escolher o projeto.

- [ ] **Step 6: Mandar um pedido**

No Telegram, mandar "liste os arquivos da raiz". Esperado: o terminal recebe o prompt; em alguns segundos chega a resposta do Claude no Telegram (texto + ▸ ações).

- [ ] **Step 7: Aprovação**

Pedir algo que exija permissão (ex.: rodar um comando). Esperado: chega o cartão *"🔐 projeto — o Claude quer: …"* com ✅/❌. Tocar ✅ → o terminal avança; o cartão vira "✅ Aprovado".

- [ ] **Step 8: `/status` e `/stop`**

`/status` lista o estado dos projetos. Com o Claude rodando, `/stop` interrompe (Esc) o projeto ativo.

- [ ] **Step 9: Segurança**

De outro chat/conta do Telegram (não pareado), mandar `/projects`. Esperado: sem resposta (ignorado).

- [ ] **Step 10: Commit final (doc de status, opcional)**

```bash
git add docs/superpowers/plans/2026-06-25-controle-remoto-telegram.md
git commit -m "docs: remote-control plan executed"
```

---

## Cobertura do spec (self-review)

- §3 Arquitetura (telegramBridge, claudeWatch, sessionTailer, ptyInjector) → Tasks 9, 10, 11 + injeção via `writePty` na 11.
- §3.3 Mapeamento projeto→PTY → `ptyForProject` (Task 11) via `cwd` (Task 1).
- §4.1 Mandar pedido → Task 11 (`handleUpdate` texto solto) + Task 10 (tail).
- §4.2 Aprovação → Task 11 (`onClaudeStatus` + `handleCallback`).
- §4.3 Fim de turno → Task 11 (`pollTailers`).
- §5 Segurança & pareamento → Tasks 5, 7, 11 (`isOwner`, `/pair`, ignora estranhos).
- §6 UI Config → Task 13.
- §7 Modelo de dados → Tasks 7 (config) + 12 (IpcApi.remote). **Refinamento vs spec:** a config remota fica em chaves próprias (`remote.*`), não dentro do blob `Settings`, para o main poder gravar sem o renderer sobrescrever.
- §8 Comandos → Task 11.
- §9 Casos de borda → tratados em 11 (backoff, sessão inexistente, fatiamento, aprovação já resolvida via edição de mensagem) e doc.
- §10 Testes → Tasks 2–5 (unit) + 14 (E2E manual).
