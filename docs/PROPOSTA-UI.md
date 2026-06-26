# Voltz IDE — Proposta de Nova UI/UX

> Redesign conceitual baseado em 7 referências visuais escolhidas pelo Cassio.
> Objetivo: uma identidade **premium, moderna, profissional e intuitiva** — distinta da atual.

---

## 1. Análise das referências (o que extrair de cada)

### 1 — Assistly (chat/code helper)
- **Sidebar limpa e seccionada**: busca no topo, navegação agrupada com sub-rótulos ("Settings & Help"), card de plano no rodapé, **perfil fixo embaixo**.
- **Code blocks com abas de linguagem** (HTML/CSS/JS) + botão "Copy code".
- **Gradiente sutil** no fundo da área de conteúdo (profundidade sem poluir).
- Cantos bem arredondados, botão de ação índigo, **input rico embaixo** (anexo, mic, contador de tokens).
> **Levar:** sidebar seccionada + perfil/contexto no rodapé · code blocks com abas · input de ação rico · gradiente sutil.

### 2 — Vibe IDE (janela flutuante)
- **Janela "desktop premium"**: cantos arredondados + sombra, **flutuando sobre um fundo colorido** (não cola nas bordas).
- **Activity rail minimalista** (ícones finos) + barra de título com abas de modo (Vibe / IDE) e dropdown de projeto.
- **Painel de prompt do Claude flutuante e contextual** no canto (com seletor de modelo e modo "build").
> **Levar:** moldura de janela flutuante · prompt do Claude flutuante/contextual com seletor de modelo · title bar com identidade.

### 3 — Vibe IDE (prompt no topo)
- Mesma linguagem, mas o **prompt de IA fica no topo da sidebar** ("Let's make your project better…"), acima da árvore.
- **Toolbar de ícones agrupada** logo abaixo (ações do projeto).
> **Levar:** IA acessível sem sair do contexto · barra de ações por ícones.

### 4 — Vibe IDE (workflow / node canvas)
- **Canvas node-based** com cards conectados, **breadcrumb** ("New Workflow › New Agent") e **toast de sucesso com tempo** ("Flow Built 11.2ms").
- Sidebar de **componentes categorizados**.
> **Levar:** breadcrumbs de contexto · feedback com micro-métricas (tempo/latência) · catálogos categorizados.

### 5 — NeuroBank AI ⭐ (a mais alinhada)
- **Layout de 3 colunas**: navegação · **histórico de conversas agrupado por tempo** (Today / Yesterday / Last 7 days) · conteúdo.
- **Boas-vindas personalizadas** com data ("Welcome back, George! · Monday, March 24").
- **Data viz integrada na resposta** (gráficos dentro do chat).
- Gradiente azul profundo, "New chat" em destaque, CTA no rodapé da nav.
> **Levar:** 3 colunas (nav · histórico · conteúdo) · **sessões do Claude agrupadas por tempo** · saudação com data · gráficos no dashboard.

### 6 — Code Search
- **Busca estruturada poderosa** (filtros `context:`, `lang:`, `line:`, `content:`) + contadores ("1677 results across 15 repositories").
- **3 colunas**: árvore · resultados (cards com badges de branch/linguagem) · **preview lateral do arquivo**.
> **Levar:** busca avançada com filtros · resultados ricos com badges · **painel de preview** lado a lado.

### 7 — Crypto exchange (CEX/DEX)
- **Abas ricas e fecháveis** com mini-info (par + preço) — exatamente o conceito de "aba que carrega status".
- **Header de métricas** com número grande (preço) + KPIs ao lado (24h, high/low, funding).
- Preto profundo + accent azul, **tipografia grande e legível**, gráfico dominante.
> **Levar:** **abas que mostram status** (branch, dev, alterações) · **header de métricas** do projeto · números grandes para o que importa.

---

## 2. Princípios de design (síntese)

1. **Desktop premium** — janela frameless flutuante, cantos `2xl`, sombra, leve gradiente de fundo.
2. **Dark profundo + índigo** — base quase-preta fria (`#0e0f12`), accent índigo (`#6571ec`) usado com intenção.
3. **3 zonas claras** — *rail* de ícones · *sidebar* contextual · *workspace* — sem competir por atenção.
4. **Contexto que carrega status** — abas e cabeçalhos mostram branch, dev server e alterações git "de relance".
5. **Claude em primeiro plano, sem atrito** — um *quick prompt* sempre à mão + histórico de sessões por tempo.
6. **Dados visíveis** — dashboard com gráficos (tempo por cliente, tarefas, atividade git/dev).
7. **Consistência total** — um único kit de componentes (botão, input, chip, card, header, dropdown).
8. **Respiro** — densidade calibrada, hierarquia tipográfica, menos linhas/bordas, mais espaço.

---

## 3. Conceito: **"Voltz Command Workspace"**

Cada **projeto** é um workspace. O **Claude** e as ferramentas (git, dev, browser, tarefas) orbitam o projeto ativo, com status sempre visível. Tudo numa **janela flutuante premium**.

### Layout principal (workspace de um projeto)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ●●●                    Voltz · freeleads                       ⌘K   ◐   ⚙      │  title bar frameless (drag)
├────┬────────────────────────┬────────────────────────────────────────────────┤
│    │  🔍  Buscar projeto…    │  freeleads     ⎇ main ·3   ●dev :5173   🍅 25:00 │  header de métricas
│ ▦  │ ───────────────────────│────────────────────────────────────────────────│
│ □  │  FAVORITOS              │  ┌── terminal ───────────┐ ┌── browser :5173 ──┐│
│ ⎇  │   ◳ Freeleads      ●    │  │ $ claude               │ │ ⌂ localhost:5173 ││
│ ⚡  │   ◳ Inside              │  │ ✻ Working… (esc)       │ │                  ││
│ ✓  │   ◳ Not a Club          │  │                        │ │   (live preview) ││
│    │                         │  │                        │ │                  ││
│    │  SESSÕES DO CLAUDE      │  └────────────────────────┘ └──────────────────┘│
│ ── │   Hoje                  │  ┌── ✦ quick prompt ───────────────────────────┐│
│ 👤 │    · refatorar auth  2h │  │  Pergunte ou comande o Claude…    opus-4.8 ▸ ││
│ ⚙  │    · corrigir build  4h │  └──────────────────────────────────────────────┘│
└────┴────────────────────────┴────────────────────────────────────────────────┘
   rail        sidebar                          workspace
```

- **Rail (56px):** Workspace · Projetos · Git · Dev · Tarefas · Skills — perfil/tema/config no rodapé.
- **Sidebar contextual:** busca no topo + seções (Favoritos, Recentes) + **Sessões do Claude agrupadas por tempo** (NeuroBank).
- **Header de métricas (crypto):** nome do projeto + `⎇ branch ·alterações` + `●dev :porta` + Pomodoro ativo.
- **Workspace:** painéis (terminal/browser/editor) como **cards arredondados** com leve sombra.
- **Quick prompt (Vibe):** input flutuante que injeta no terminal do Claude, com **seletor de modelo**.

### Tela de Busca no projeto (Code Search)

```
┌── 🔍 buscar "useAuth"   [Aa] [.*] [palavra]                 142 em 38 arquivos ──┐
├───────────────┬───────────────────────────────┬────────────────────────────────┤
│ ARQUIVOS      │ src/auth/useAuth.ts        12  │  useAuth.ts            ⎇ main   │
│ ▸ src         │   12  export function useAuth  │  10  import { api } …          │
│   ▸ auth      │   28  const { user } = useAuth │  11                            │
│     useAuth   │ src/app/Login.tsx           5  │  12  export function useAuth(  │  ← preview
│   ▸ app       │   5   const a = useAuth()      │  13    const [user] = …        │
│     Login     │                               │                                │
└───────────────┴───────────────────────────────┴────────────────────────────────┘
```

### Dashboard (NeuroBank — data viz)

```
┌─ Bom dia, Cassio   ·  qua, 11 jun ─────────────────────────────────────────────┐
│  ┌ pendentes hoje ┐ ┌ dev ativos ┐ ┌ alterações git ┐ ┌ foco hoje 🍅 ┐         │
│  │      4         │ │     2      │ │       12        │ │   1h25         │         │
│  └────────────────┘ └────────────┘ └─────────────────┘ └────────────────┘         │
│  ┌── Tempo por cliente (semana) ─────────┐  ┌── Tarefas de hoje ──────────────┐ │
│  │  ▁▂▅█▆▃▂  (gráfico)                    │  │ ☐ Webhook Eagle      Inside     │ │
│  └────────────────────────────────────────┘  │ ☑ Site Milena…       Inside     │ │
│  ┌── Dev servers ────────────────────────┐    └─────────────────────────────────┘ │
│  │ ● freeleads :5173   ● inside :4321     │                                       │
│  └────────────────────────────────────────┘                                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Design system (kit único)

- **Cores:** já migradas para grafite frio + índigo (claro/escuro). Neutralizar a paleta de projetos para tons frios harmônicos (ou cores suaves theme-aware).
- **Tipografia:** Inter; escala clara — `display` (24/28, métricas), `title` (15/16), `body` (13), `caption` (11), `mono` (code/terminal).
- **Raio:** `lg` 10px (controles) · `xl` 14px (cards/inputs) · `2xl` 18px (janela/painéis).
- **Sombra/profundidade:** painéis com sombra suave + 1px de borda translúcida; gradiente de fundo discreto.
- **Componentes-base a padronizar:**
  - `Button` (primary índigo / ghost / icon) · `Input`/`Search` · `Chip/Pill` (theme-aware, já feito) ·
    `Card` (painel arredondado) · `PanelHeader` · `Dropdown/Menu` · `Tab` (rica, com status) · `StatCard` · `EmptyState` · `Toast`.
- **Microinterações:** hover/active consistentes, transições 120–180ms, foco com ring índigo.

---

## 5. Roadmap de implementação (faseado, baixo risco)

1. **Fundação visual** *(rápido, alto impacto)* — janela frameless flutuante + gradiente de fundo + raios/sombra padronizados + neutralizar cores de projeto. *(parte já feita: paleta)*
2. **Kit de componentes** — extrair `Button/Input/Chip/Card/PanelHeader/Tab/Dropdown` num módulo `components/ui/` e trocar nas telas (propaga consistência).
3. **Abas ricas + header de métricas** — abas com branch/dev/alterações; header do workspace estilo "crypto".
4. **Sidebar + Sessões do Claude por tempo** — reorganizar sidebar; histórico agrupado (Hoje/Ontem/7 dias).
5. **Quick prompt do Claude** — input flutuante que injeta no terminal, com seletor de modelo.
6. **Dashboard com data viz** — KPIs + gráficos (tempo por cliente, tarefas, dev/git).
7. **Busca em 3 colunas** — árvore · resultados ricos · preview lateral.
8. **Polish** — code blocks com abas, breadcrumbs, toasts com micro-métricas, animações finais.

> Cada fase é entregável e testável isolada. Começo pela **1 + 2** (fundação + kit), que é onde mora o salto de "profissional".
