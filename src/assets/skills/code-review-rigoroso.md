---
name: code-review-rigoroso
description: Perform a rigorous, opinionated code review of a pull request or set of changes. Use this skill when the user asks to "review code", "review PR", "revisar PR", "revisar código", "review my changes", or whenever the user wants critical feedback on a diff before merging. Focuses on correctness, security, maintainability, and team conventions — not just style.
---

# Code review rigoroso

Esta skill faz code review **crítico e construtivo** de um diff (PR aberto, branch local, ou conjunto de arquivos modificados). Não é um lint — é a revisão que um senior staff faria antes de aprovar.

## Quando ativar

- Usuário pede "revise esse PR", "code review", "olha esse diff", "que você acha desse código"
- Antes de um merge para `main` ou `production`
- Após mudanças grandes em código crítico (auth, pagamento, dados sensíveis)

## Processo

1. **Entenda o objetivo** antes de criticar a implementação
   - Leia a descrição do PR / commit message
   - Se não estiver claro, pergunte: "O que esse PR tenta resolver?"
   - Identifique o **escopo prometido** — qualquer mudança fora dele é suspeita

2. **Leia os testes ANTES do código de produção**
   - Os testes contam a história: O que esse código promete fazer?
   - Se não há testes para mudança crítica → flag imediato
   - Teste que só checa "não dá erro" sem assertion forte → flag

3. **Faça 3 passadas** no diff:
   - **Passada 1 — Correctness**: A lógica está certa? Edge cases (null, [], 0, "", negativo, concorrência) tratados?
   - **Passada 2 — Segurança**: Input não confiável escapado? SQL via parâmetros? Secrets fora do código? Permissões verificadas?
   - **Passada 3 — Manutenibilidade**: Próxima pessoa entende em 6 meses? Funções pequenas e bem nomeadas? Abstrações justificadas?

4. **Verifique consistência com o resto do projeto**
   - Padrão de erro: já tem `Result<T>`? Não invente outro
   - Padrão de log: usa `logger.info`? Não chame `console.log`
   - Estrutura de pastas: nova feature segue a convenção existente?
   - Use `git log` / `git blame` em arquivos vizinhos para confirmar convenções

## Categorias de feedback (priorize nessa ordem)

### 🔴 Blocker — não pode mergear
- Bug com impacto em prod (race condition, off-by-one em pagamento, etc.)
- Falha de segurança (XSS, SQL injection, secret commitado, autorização ausente)
- Quebra contrato público (API, schema de banco, evento publicado)
- Sem testes para lógica crítica nova

### 🟠 Issue — deve ser resolvido antes do merge
- Edge case não tratado mas improvável em prod
- Performance ruim em caminho quente (N+1, loop O(n²) em lista crescente)
- Erro silenciado (`catch {}` sem log nem comportamento)
- Acoplamento desnecessário entre módulos
- Naming ruim em API pública (vai ficar)

### 🟡 Nit — sugestão, autor decide
- Refactor estético, oportunidade de extrair função
- Comentário redundante ou faltando
- Ordem de imports, espaçamento

### 🟢 Praise — feedback positivo
- Sempre que algo for **bem feito**, mencione explicitamente
- Reforça padrões bons e o autor sabe que está no caminho certo

## Como escrever o review

- **Específico**: cite arquivo + linha. Não "tem código duplicado" → "Os blocos em `auth.ts:42-58` e `auth.ts:73-89` são idênticos, extrair pra função."
- **Acionável**: termine cada issue com uma sugestão concreta. Não "isso tá confuso" → "Renomeie `processItem` pra `validateAndSaveItem` pra refletir o que faz."
- **Justificado**: explique o **porquê**, especialmente em nits. Sem `porque eu acho` — porque race condition X, porque convenção Y do projeto.
- **Sem agressividade**: critique o código, não a pessoa. "O `forEach` async aqui não espera as promises" — não "Você esqueceu de awaitar".

## Formato de saída

Estruture o review em seções:

```markdown
## Resumo
[1-2 frases: o que o PR tenta fazer e veredito geral]

## 🔴 Blockers
- **arquivo.ts:42** — [problema]. [sugestão concreta]

## 🟠 Issues
- **arquivo.ts:123** — [problema]. [sugestão]

## 🟡 Nits
- **arquivo.ts:201** — [sugestão opcional]

## 🟢 Praise
- [coisa boa observada]

## Recomendação
[Aprovar / Pedir mudanças / Bloquear]
```

## Sinais de cuidado extra

Vermelhe sempre que ver:
- Mudança em código de **autenticação ou autorização** sem teste de cenário negativo
- **Migration** com `DROP` / `ALTER` sem rollback documentado
- **Loop** processando lista que cresce com o tempo
- **Catch silencioso** (engole erro sem log)
- **Magic number** sem nome (`if (count > 17)`)
- **Comentário "TODO"** sem ticket associado
- **Logging** com dado sensível (PII, token, password)
- **API** com novo endpoint sem versionamento ou rate limit
