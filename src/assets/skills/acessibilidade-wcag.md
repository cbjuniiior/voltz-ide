---
name: acessibilidade-wcag
description: Audit and fix accessibility issues (WCAG 2.2 AA) in web UI components and pages. Use this skill when the user asks to "fix accessibility", "a11y", "acessibilidade", "WCAG", "screen reader", "leitor de tela", "keyboard navigation", "navegação por teclado", or wants to make a UI inclusive.
---

# Acessibilidade web — WCAG 2.2 AA

Esta skill aplica padrões **WCAG 2.2 AA** (o mínimo legal/ético) em UIs web. Não é teatro de checkbox — é fazer a interface funcionar pra usuários de teclado, leitores de tela, baixa visão, daltonismo e cognitivo.

## Quando ativar

- Auditoria pré-lançamento ou pós-design review
- "Esse botão não funciona com teclado"
- "Cliente exige WCAG AA"
- Componente novo de design system
- App que vai pra contrato público (LGPD inclui acessibilidade)

## Os 4 princípios POUR (decore)

1. **Perceptível** — informação não pode estar só em cor, áudio, vídeo
2. **Operável** — tudo funciona com teclado e tempo razoável
3. **Compreensível** — texto legível, comportamento previsível
4. **Robusto** — funciona com tecnologia assistiva (leitor de tela)

## Checks essenciais (em ordem de impacto)

### 1. Tudo navegável por teclado

**Teste manual:**
- Aperte `Tab` desde o topo da página até o footer
- Você consegue chegar em todos os controles? Em ordem lógica?
- `Enter` / `Espaço` ativam botões? `Esc` fecha modals?
- Foco está **visível** (anel ou borda destacada)?

**Fixes comuns:**
- ❌ `<div onClick={...}>` → ✅ `<button>` (ou `role="button" tabIndex={0}` + handler de Enter)
- ❌ Custom dropdown que perde foco no `Esc` → adicione `useEffect` que devolve foco ao trigger
- ❌ `outline: none` no `:focus` → SUBSTITUA por estilo customizado, NUNCA remova sem substituir

```css
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### 2. Contraste de cor

WCAG AA exige:
- **Texto normal** (< 18pt): ≥ 4.5:1
- **Texto grande** (≥ 18pt ou 14pt bold): ≥ 3:1
- **Componentes de UI** (botão, input border, ícone funcional): ≥ 3:1

**Verifique:**
- DevTools → Inspector → Acessibility → Contrast (Chrome)
- Lighthouse → Accessibility
- https://webaim.org/resources/contrastchecker/

**Cuidados comuns:**
- "Placeholder" cinza claro em fundo branco → quase sempre falha
- "Disabled" botão → AAA não exige, AA exige se é informacional
- Texto sobre imagem / gradiente → forçar fundo sólido atrás ou overlay

### 3. Imagens com `alt`

```html
<!-- Decorativa: alt vazio explícito -->
<img src="ornamento.svg" alt="" />

<!-- Funcional: descreve a função -->
<img src="lupa.svg" alt="Buscar" />
<!-- Melhor: <button aria-label="Buscar"><svg ... aria-hidden="true" /></button> -->

<!-- Informacional: descreve conteúdo -->
<img src="grafico-vendas-q3.png" alt="Vendas Q3: R$ 1.2M, +23% vs Q2" />

<!-- Logo do site: nome da empresa -->
<img src="logo.svg" alt="Voltz" />
```

**Erros comuns:**
- ❌ `alt="image"` ou `alt="foto"` (sem conteúdo)
- ❌ `alt="Logo da empresa Voltz"` (redundante — "logo")
- ❌ Sem alt em imagem informacional (leitor de tela lê o filename)

### 4. Form labels

Todo input precisa de label associado:

```html
<!-- ✅ Implícito -->
<label>E-mail <input type="email" /></label>

<!-- ✅ Explícito (mais flexível) -->
<label for="email">E-mail</label>
<input id="email" type="email" />

<!-- ✅ Sem label visível (procura inline tipo barra de busca) -->
<input type="search" aria-label="Buscar produtos" />
```

**Não use** placeholder como único label — ele some ao digitar e tem contraste ruim.

**Erros agrupados:**
```html
<input aria-invalid="true" aria-describedby="email-err" />
<span id="email-err" role="alert">Hm, falta o @ no e-mail</span>
```

### 5. Headings hierárquicos

Estrutura semântica importa pra leitor de tela navegar.

- Uma `<h1>` por página (geralmente título da página)
- Não pule níveis (`h1` → `h3` sem `h2`)
- Use heading pra **estrutura**, não pra tamanho (use CSS pra tamanho)

```html
<!-- ❌ -->
<h1>Título</h1>
<h3>Seção</h3>   <!-- Pulou h2 -->

<!-- ✅ -->
<h1>Título</h1>
<h2>Seção</h2>
<h3>Subseção</h3>
```

### 6. Landmarks ARIA

Use HTML5 semântico — landmarks vêm grátis:

```html
<header>
<nav aria-label="Primary">
<main>
<aside>
<footer>
```

Em SPA: `<main>` envolve o conteúdo trocado por rota; restante (sidebar, header) fora.

### 7. Componentes interativos customizados

Quando você cria controles não-nativos (combobox custom, tabs, modal, accordion), siga **WAI-ARIA Authoring Practices**:

https://www.w3.org/WAI/ARIA/apg/

Cada padrão tem teclas esperadas, atributos ARIA, estados de foco. **Não invente.**

Exemplo (modal):
```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirmar exclusão</h2>
  <!-- foco vai pro 1o controle focável ao abrir -->
  <!-- Esc fecha -->
  <!-- foco preso dentro do modal (focus trap) -->
  <!-- foco volta pro trigger ao fechar -->
</div>
```

### 8. Movimento e animação

- Animação contínua (carrossel, loop) precisa de **botão pra pausar**
- Auto-play de vídeo: sempre **muted** + **controls**
- Respeite `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 9. Cor não pode ser único meio

- Erro de formulário em vermelho? Adicione ícone + texto.
- Gráfico com séries só por cor? Adicione padrão (linhas tracejadas, hachuras) ou label inline.

### 10. Tempo limite com aviso

Se há timeout de sessão / form:
- Avise antes de expirar com opção de estender
- Ou desabilite timeout pra usuários autenticados

## Ferramentas de auditoria

- **axe DevTools** (Chrome extension) — melhor scanner automático
- **Lighthouse** (built-in) — score rápido
- **WAVE** (https://wave.webaim.org/) — visual issues
- **VoiceOver** (Mac, Cmd+F5) ou **NVDA** (Windows, free) — teste real com leitor de tela
- **Tab key only** — desplugue o mouse e tente usar a página

## Output do audit

```markdown
## Resumo
[N issues críticas, M altas, X médias]

## 🔴 Críticas (bloqueia uso pra alguma deficiência)
- **arquivo.tsx:42** — [problema concreto]. **Impacto**: [quem é afetado]. **Fix**: [código sugerido]

## 🟠 Altas (WCAG AA falha)
[idem]

## 🟡 Médias / nice-to-have
[idem]

## ✅ Bem implementado
[reconheça]
```

## Lembrete
A11y não é sobre ferramentas — é sobre incluir pessoas. Sempre que possível, **teste com usuário real** que usa leitor de tela ou teclado-only. Isso muda mais que qualquer checklist.
