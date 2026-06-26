# Controle remoto do Voltz IDE via Telegram — Design

**Data:** 2026-06-25
**Status:** Aprovado (design) — aguardando plano de implementação
**Autor:** Cassio + Claude

## 1. Objetivo

Permitir que o usuário, pelo **celular**, em **qualquer lugar** (rede local ou internet):

1. Mande novos pedidos/prompts para o Claude Code de um **projeto específico**.
2. **Leia** as respostas do Claude (texto limpo + resumo de ações).
3. **Acompanhe e aprove/negue** as ações que o Claude pede permissão para executar.

A interface no celular é um **bot do Telegram** (sem app próprio, sem túnel, sem abrir portas). A abordagem é **espelhar a sessão Claude que já está aberta no app** (não uma sessão paralela): o que você faz pelo celular acontece no mesmo terminal que você vê no PC.

## 2. Não-objetivos (fora do MVP)

- Codex / Gemini (virá depois via "raspagem de terminal" — abordagem B).
- Múltiplos usuários / múltiplos chats pareados.
- Espelho completo/contínuo do terminal (streaming de cada caractere).
- Iniciar dev server, abrir browser interno, navegar arquivos remotamente.
- Entrada por voz.
- "Aprovar sempre nesta sessão" (auto-aprovação).

## 3. Arquitetura

Tudo no **processo principal do Electron** (`electron/`), para funcionar mesmo com a janela minimizada/fechada-para-a-bandeja (o app permanece vivo). Quatro serviços novos + uma camada de IPC + uma seção de UI.

### 3.1 Componentes novos

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `telegramBridge` | `electron/services/telegramBridge.ts` | Conexão de saída com a Telegram Bot API via **long-polling** (`getUpdates`). Recebe mensagens/cliques de botão; envia mensagens e cartões. Roteia comandos. Filtra pelo `chatId` pareado. |
| `claudeWatch` | `electron/services/claudeWatch.ts` | "Escuta" a saída de cada PTY (o main é a fonte do stream), remove ANSI e detecta **por terminal**: `running` / `approval` / `idle`. Mantém um buffer curto do texto recente (para extrair o alvo da aprovação). Emite eventos. Porta para o main as regexes que hoje vivem no renderer (`claudeStatus`). |
| `sessionTailer` | `electron/services/sessionTailer.ts` | Localiza e acompanha (tail) o `*.jsonl` da sessão ativa do projeto. Extrai o **texto das mensagens `assistant`** e um resumo dos `tool_use`/`tool_result`. Reusa a lógica de localização de `electron/services/claudeSessions.ts`. |
| `ptyInjector` | (parte de `telegramBridge`, usando `ptyManager`) | Escreve no PTY do terminal Claude do projeto certo: prompt (`texto` + `\r`) ou tecla de aprovação (`1`/`2`/`y`/`n`/Esc). |

### 3.2 Componentes reusados (existentes)

- `electron/services/ptyManager.ts` — escrever no PTY, listar PTYs, mapear terminal↔PID. Precisa expor um meio de obter o PTY do terminal Claude ativo de um projeto.
- `electron/services/claudeSessions.ts` — localizar a pasta/arquivo de sessão do Claude (já lida com a codificação do caminho e variações de case).
- `electron/ipc/store.ts` (electron-store `voltz-ide`) — persistir token, `chatId` pareado, código de pareamento e flags por projeto.
- Regexes de detecção do renderer (`src/components/TerminalPane.tsx`: `CLAUDE_ACTIVITY_RE`, `CLAUDE_APPROVAL_RE`, `CLAUDE_IDLE_MS`, `ANSI_RE`) — portadas/compartilhadas com o `claudeWatch`.
- `src/components/SettingsModal.tsx` — ganha a categoria "Remoto".
- `shared/types.ts` — novos campos de `Settings` e a `IpcApi.remote`.

### 3.3 Mapeamento projeto → terminal Claude

O bridge precisa saber, para um projeto, **qual PTY** receber o prompt. Regra:
- Entre os terminais do projeto, escolher o que está rodando Claude (detectado pelo `claudeWatch`, status ≠ null, ou o que foi iniciado com `autoStartClaude`).
- Se houver mais de um, usar o mais recentemente ativo.
- Se não houver nenhum Claude rodando no projeto, o bot responde: *"Nenhuma sessão Claude aberta nesse projeto. Abra/rode o Claude no app primeiro."* (iniciar Claude remotamente fica para depois.)

## 4. Fluxos de dados

### 4.1 Mandar um pedido
1. Você manda texto no Telegram → `telegramBridge` valida `chatId`.
2. Resolve o **projeto ativo** da conversa (último escolhido via `/projects`); se nenhum, pergunta.
3. `ptyInjector` escreve `"<texto>\r"` no PTY Claude do projeto.
4. Claude processa → grava `assistant`/`tool_use` no `*.jsonl`.
5. `sessionTailer` detecta as novas linhas → `telegramBridge` envia o texto limpo (fatiado em ≤4096 chars) + resumo de ações.

### 4.2 Aprovação
1. `claudeWatch` detecta `approval` no PTY do projeto.
2. `telegramBridge` monta o alvo da aprovação (último `tool_use` do JSONL e/ou o trecho do buffer do terminal) e envia um **cartão** com botões `✅ Aprovar` / `❌ Negar`.
3. Você toca → callback do botão → `ptyInjector` injeta a tecla (`1\r` para aprovar, `2\r`/Esc para negar — o mapeamento exato é validado contra o formato atual do prompt do Claude).
4. `claudeWatch` confirma a saída do estado `approval`; o bot edita o cartão para *"✅ Aprovado"* / *"❌ Negado"*.

### 4.3 Notificação de fim de turno
- Quando `claudeWatch` passa de `running`→`idle` após um turno, o bridge envia a resposta acumulada (do `sessionTailer`) — respeitando a config de "notificar fora da aba ativa" que já existe.

## 5. Segurança & pareamento

- **Um único chat dono.** O bridge só age sobre o `chatId` pareado; qualquer outro é ignorado (log silencioso).
- **Pareamento:** o app gera um **código** de uso único (ex.: 6 dígitos). Você envia `/pair <código>` ao bot; se bater, o bridge grava `ownerChatId`. O código expira após o uso ou em alguns minutos.
- **Token local:** guardado no electron-store; só trafega para a API do Telegram (HTTPS de saída).
- **Rede de segurança preservada:** prompts enviados rodam com o mesmo poder de você digitando, **mas** as ações que exigem permissão continuam passando pelo cartão de aprovação. Restrição-ao-chat-pareado + gate de aprovação do Claude = as duas camadas de proteção.
- **Habilitação por projeto:** só projetos marcados como "remoto" no app aparecem/aceitam comandos.
- **Desligável:** botão liga/desliga geral; sem token, o serviço fica inerte.

## 6. UI no app (Configurações → "Remoto")

Nova categoria na `SettingsModal` (ícone de antena/`Smartphone`):
- **Token do bot:** input (tipo password) + mini-guia: *"@BotFather → `/newbot` → cole o token aqui"*.
- **Status da conexão:** *"Conectado como @SeuBot"* (após validar via `getMe`) ou erro.
- **Pareamento:** *"Pareado ✓ (seu celular)"* **ou** o código + instrução `/pair <código>`. Botão "Desparear".
- **Projetos habilitados:** lista dos projetos escaneados com um `Toggle` "remoto" em cada.
- **Liga/desliga geral** do bridge.
- (Opcional, fase 2) indicador `📡` no header do terminal quando o projeto está remoto.

## 7. Modelo de dados (deltas)

`Settings` (em `shared/types.ts` + defaults no store):
```ts
remoteEnabled: boolean;          // liga/desliga geral (default false)
remoteTelegramToken: string | null;
remoteOwnerChatId: string | null;   // gravado ao parear
remoteProjects: string[];           // paths dos projetos habilitados
```
Estado efêmero (não persistido): código de pareamento atual + sua expiração.

`IpcApi.remote`:
```ts
remote: {
  status: () => Promise<{ running: boolean; botUsername: string | null; paired: boolean; pairingCode: string | null; error?: string }>;
  setToken: (token: string | null) => Promise<{ ok: boolean; botUsername?: string; error?: string }>;
  setEnabled: (on: boolean) => Promise<void>;
  generatePairingCode: () => Promise<string>;
  unpair: () => Promise<void>;
  onStatus: (cb: (s: ...) => void) => () => void;  // status push p/ a UI de Config
}
```

## 8. Comandos do bot (MVP)

| Comando | Ação |
|---|---|
| `/start` | Boas-vindas + instrução de pareamento se não pareado. |
| `/pair <código>` | Vincula o chat. |
| `/projects` (`/p`) | Lista projetos habilitados como botões; escolhe o ativo. |
| (texto solto) | Prompt para o Claude do projeto ativo. |
| `/status` | Resumo do estado de cada projeto (rodando/ocioso/esperando). |
| `/stop` | Interrompe o projeto ativo (Esc/Ctrl+C). |
| (botões) | `✅ Aprovar` / `❌ Negar` nos cartões de aprovação. |

## 9. Casos de borda & erros

- **Token inválido / sem internet:** `getMe`/`getUpdates` falha → status de erro na UI; retry com backoff; não derruba o app.
- **Sessão Claude inexistente no projeto:** bot avisa para abrir/rodar o Claude no app.
- **Resposta muito longa:** fatiar em mensagens ≤4096 chars; cortar buffers de terminal com elipse.
- **Múltiplos terminais Claude no mesmo projeto:** usar o mais recentemente ativo; `/projects` pode desambiguar depois (fase 2).
- **Aprovação some antes do toque** (você aprovou no PC): `claudeWatch` saiu do estado `approval` → o bot edita o cartão para *"já resolvido no app"*.
- **Formato do prompt de aprovação variar:** o injetor tenta a sequência mais robusta (selecionar a opção "Yes"); manter o mapeamento isolado e fácil de ajustar.
- **App fechado de vez (não só minimizado):** o bridge para junto (é parte do processo). Documentar que o app precisa estar rodando (na bandeja).

## 10. Testes

- **Unit:** `claudeWatch` (detecção approval/idle a partir de amostras de saída ANSI gravadas); `sessionTailer` (extrair `assistant`/`tool_use` de um `.jsonl` de exemplo); fatiador de mensagens; verificação de `chatId`.
- **Integração (manual/dev):** parear; mandar prompt e ver resposta; disparar uma ação que exige aprovação e aprovar/negar pelo bot; `/status` e `/stop`.
- **Segurança:** mensagem de um `chatId` não pareado é ignorada; sem token o serviço fica inerte.

## 11. Escopo do MVP (resumo)

**Entra:** Claude Code; 1 chat pareado; `/projects` + prompt + leitura de resposta + cartões de aprovação + `/status` + `/stop`; respostas = texto + resumo de ações; UI de Config (token, pareamento, projetos, on/off).
**Depois:** Codex/Gemini, vários usuários, espelho de terminal, iniciar dev/abrir browser/arquivos remotos, voz, auto-aprovar, indicador 📡 no header.
