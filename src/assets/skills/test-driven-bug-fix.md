---
name: test-driven-bug-fix
description: Fix bugs with a strict test-first workflow that guarantees the fix and prevents regression. Use this skill when the user reports a bug, says "isso está quebrado", "não funciona", "está com bug", "fix this", or asks to investigate unexpected behaviour. Forces writing a failing test that reproduces the bug BEFORE editing production code.
---

# Bug fix dirigido por testes

Esta skill aplica o ciclo **red → green → refactor** quando há um bug a corrigir. O bug **só está resolvido** quando existe um teste automatizado que falha antes do fix e passa depois.

## Quando ativar

- Usuário relata comportamento incorreto ou inesperado
- Stack trace, log de erro, screenshot de tela quebrada
- "Reproduz quando faço X mas devia fazer Y"
- Issue do GitHub / Jira com descrição de bug

## Processo obrigatório

### 1. Reproduza ANTES de diagnosticar

Não confie na descrição do bug. **Reproduza** localmente:

- Pergunte ao usuário os passos exatos se não estiverem no relato
- Identifique input mínimo que dispara o bug
- Note o comportamento atual VS o esperado

Se não conseguir reproduzir, **pare e pergunte**. Bug não reproduzido vira fix especulativo, que vira regressão.

### 2. Escreva o teste que falha

- **Primeiro um teste que reproduza o bug** com input mínimo
- O teste deve **falhar** com a mensagem do bug atual
- Coloque o teste num arquivo de teste **existente** próximo ao código quebrado, ou crie um novo seguindo a convenção do projeto
- **Não modifique código de produção ainda**

Rode o teste e confirme que ele falha pelo motivo certo:
```bash
npm test -- nome-do-arquivo.test
# ou pytest, go test, cargo test, etc.
```

Se o teste passar de cara, o repro está errado — refine.

### 3. Investigue a causa raiz

Com o teste falhando como âncora:

- **Leia o stack trace de baixo pra cima** — a primeira linha do seu código (não da lib) é onde investigar
- Use `git log -p` ou `git blame` no arquivo culpado pra entender **quando** e **por que** o código atual foi escrito assim
- Pergunte: "esse é um bug no código atual, ou uma feature gap que nunca foi pensada?"
- Identifique a **causa raiz**, não o sintoma. Se a função A retorna lixo porque B passou lixo porque C carregou lixo — o fix é em C, não em A com defensive check.

### 4. Faça o fix mínimo

- Mude apenas o necessário pra fazer o teste passar
- Não refatore no mesmo commit
- Não adicione "defesas" especulativas em funções que não foram afetadas
- Não mude APIs públicas se um fix interno resolve

### 5. Rode todos os testes, não só o novo

```bash
npm test  # rodar tudo
```

Um fix que quebra outros testes não é um fix, é uma troca de bug.

### 6. Adicione testes para regressão correlata

Se a causa raiz era "edge case X não tratado", pense em **edge cases vizinhos**:
- Se foi `null`, e se for `undefined`? `""`? `[]`?
- Se foi entrada vazia, e se for entrada gigante?
- Se foi ordem A→B, e se for B→A?
- Se foi usuário não-logado, e se for logado mas sem permissão?

Adicione testes para os vizinhos que você acha que podem quebrar.

### 7. Commit

Mensagem do commit:
```
fix(escopo): descrição curta do que estava errado

Antes: [comportamento incorreto]
Depois: [comportamento correto]
Causa raiz: [explicação técnica]

Closes #123  (se aplicável)
```

## Anti-padrões — NÃO faça

- ❌ **Catch silencioso pra parar de ver o erro**: `try { ... } catch {}` esconde o problema, não resolve
- ❌ **Defensive check em todo lugar** pra "garantir": adiciona ruído sem resolver a causa
- ❌ **Mudar o teste pra ele passar**: se o teste assertaria comportamento certo e agora você mudou pra aceitar o errado, você não corrigiu nada
- ❌ **Refatorar junto com o fix**: faz a revisão impossível, mistura objetivos
- ❌ **Comentar código quebrado**: delete. Git lembra de tudo.
- ❌ **Adicionar `console.log` que ficou** depois de debugar

## Quando o "bug" não é um bug

Às vezes o "bug" reportado é comportamento intencional que o usuário não esperava. Antes do fix:

1. Existe issue/spec/PR antigo definindo esse comportamento?
2. Existe teste atual que **afirma** esse comportamento?

Se sim → não é bug, é **expectativa quebrada**. Discuta com o usuário antes de mudar.

## Outputs esperados

Ao concluir, apresente:

1. **Teste novo** (path + nome do teste) que falha antes do fix
2. **Diff do fix** com explicação da causa raiz
3. **Resultado dos testes** completos rodando (`npm test` etc.)
4. **Commit message** sugerida
