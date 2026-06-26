---
name: refactor-incremental
description: Refactor existing code safely in small, behaviour-preserving steps with tests as a safety net. Use this skill when the user asks to "refatorar", "limpar esse código", "melhorar essa função", "split this file", "extract", "rename", "simplificar". Forces incremental changes and avoids the "big bang rewrite" trap.
---

# Refactor incremental e seguro

Esta skill aplica refactor **sem alterar comportamento observável**, em passos pequenos com rede de proteção (testes ou verificação manual entre cada passo).

## Quando ativar

- "Limpa esse código", "tá uma bagunça", "refatora isso"
- "Quebra esse arquivo gigante em partes"
- "Renomeia X pra Y", "extrai pra função/classe", "move pra outro arquivo"
- Antes de adicionar feature nova num código complexo (refactor pra preparar terreno)

## Regra de ouro

**Refactor não muda comportamento.** Se o que o código FAZ muda, é feature ou fix, não refactor. Mistura tudo é receita de bug em produção.

## Processo

### 1. Estabeleça a rede de segurança

Antes de mexer:

- **Existem testes** que cobrem o código que vai mudar?
  - Sim → ótimo, rode pra confirmar que passam (`green` antes de começar)
  - Não → adicione **testes de caracterização** (testes que documentam o comportamento atual, mesmo que esquisito) ANTES de refatorar

- **Se for UI sem testes E2E**: defina um **roteiro de QA manual** (lista de cliques + observações) que você vai rodar entre passos

- Confirme que `npm run build` / `npm run typecheck` passa antes de começar

### 2. Defina o escopo em UMA frase

- ✅ "Extrair a lógica de validação de `UserForm` pra função pura `validateUser`"
- ✅ "Renomear `processItem` → `validateAndSaveItem`"
- ✅ "Quebrar `api.ts` (800 linhas) em `api/users.ts`, `api/products.ts`, `api/orders.ts`"
- ❌ "Limpar o módulo de usuários" — vago, vai virar refactor sem fim
- ❌ "Refatorar e adicionar suporte a TS" — duas coisas

Se o escopo é grande, **quebre em vários refactors menores**.

### 3. Faça em passos pequenos

Cada passo precisa:
- **Compilar** (`tsc --noEmit` / `cargo check` / `mypy`)
- **Passar nos testes** (rodar a suíte relevante)
- **Ser commitável sozinho** (representa um estado válido do código)

Padrões seguros:

- **Rename**: use refactor da IDE (não busca-e-substitui cego); rode testes; commit
- **Extract function**: extraia, mantenha mesma assinatura, chame de onde estava; rode testes; commit
- **Move file**: mova com `git mv` (mantém histórico); ajuste imports; rode build; commit
- **Inline**: oposto do extract; mesma regra
- **Replace conditional with polymorphism**: introduza interface, migre call sites um por um, remova condicional no fim

### 4. NÃO faça no mesmo PR

- Refactor + mudança de comportamento → separe em PRs distintos
- Refactor + fix de bug → faça o fix primeiro (com teste), depois refatore
- Refactor + nova feature → refatore primeiro, mergeie, depois feature
- Refactor + atualização de dependência → não.

### 5. Sinais de que o refactor saiu do controle

Pare imediatamente se:

- Você precisa "consertar" testes que estavam passando antes → não é refactor, mudou comportamento
- Você está rescrevendo o módulo do zero → vire um plano separado
- Você tá há mais de uma hora sem fazer commit → algo deu errado
- Você tá lutando contra o type checker → o design novo não é melhor, é diferente; reavalie

## Refactors clássicos e quando usar

| Refactor | Quando aplicar | Cuidado |
|---|---|---|
| Rename | Nome atual confunde, está errado, ou é genérico demais | Use ferramenta da IDE — busca cega quebra strings |
| Extract function | Bloco de código repetido OU bloco com nome claro escondido | Mantenha pura quando possível |
| Inline function | Função existe só pra ser chamada 1 vez e o nome não ajuda | Cuide com chamadas que viraram inválidas |
| Move file | Arquivo cresceu demais OU pertence a outra pasta | `git mv` pra preservar histórico |
| Replace if-else by lookup | Cadeia `if/else if` mapeando valor → comportamento | Cuide com defaults |
| Introduce parameter object | Função com 5+ params, vários booleans | Migre call sites um por um |
| Decompose conditional | `if` complexo com vários `&&`/`||` | Extraia em funções booleanas nomeadas |

## Anti-padrões

- ❌ **Big bang rewrite**: rescrever módulo inteiro num único PR. Impossível revisar, impossível reverter parcialmente.
- ❌ **Pre-emptive abstraction**: criar interface/factory porque "pode precisar". YAGNI. Generalize quando o segundo caso aparecer.
- ❌ **Reorganizar imports + lógica no mesmo commit**: diff fica ilegível
- ❌ **Comentar como refatorar em vez de refatorar**: `// TODO: extract this` que nunca sai

## Outputs esperados

Para cada passo de refactor:

1. **Descrição em 1 linha** do que mudou
2. **Diff** do passo
3. **Comando de teste** que confirma comportamento preservado
4. **Commit message** sugerida (`refactor(escopo): ...`)
