---
name: secrets-leak-scan
description: Scan a repository for committed secrets (API keys, tokens, passwords, private keys) and harden the workflow to prevent future leaks. Use this skill when the user asks to "scan for secrets", "vazei uma chave", "leak", "tirei do .env mas commitei", or before making a private repo public.
---

# Scan e remediação de secrets vazados

Esta skill detecta secrets que foram commitados no histórico do git e orienta a remediação correta — incluindo rotação das credenciais (que é a parte que mais gente esquece).

## Quando ativar

- Pré-publicação de repo privado como público
- Após relato "comitei um .env por engano"
- Auditoria periódica de segurança
- Setup inicial de hooks/CI pra prevenir reincidência

## Verdade dura primeiro

**Reescrever o histórico do git NÃO remove o secret se ele já foi pushed.** Pessoas/bots já podem ter clonado. A única ação que importa é **ROTACIONAR o secret no provider** (gerar nova chave e invalidar a antiga). Limpar o git é cosmético — útil, mas secundário.

## Processo

### 1. Scan do estado atual

Use ferramentas estabelecidas (em ordem de preferência):

```bash
# gitleaks — rápido, bons defaults
gitleaks detect --source . --no-banner

# trufflehog — busca mais profunda, valida secrets contra API
trufflehog filesystem . --only-verified

# git-secrets (AWS-focused)
git secrets --scan

# Scan apenas histórico (não working tree)
gitleaks detect --source . --log-opts="--all"
```

Se nenhum tiver instalado, busque manualmente os padrões mais comuns:

```bash
# AWS Access Key
grep -rE "AKIA[0-9A-Z]{16}" .

# AWS Secret Key (heurística)
grep -rE "[A-Za-z0-9/+=]{40}" --include="*.env*" --include="*.yml" .

# Stripe (sk_live_, sk_test_, rk_live_)
grep -rE "(sk|rk)_(live|test)_[0-9a-zA-Z]{24,}" .

# OpenAI / Anthropic / similar
grep -rE "sk-(ant-|proj-)?[A-Za-z0-9\-_]{20,}" .

# Private keys
grep -rl "BEGIN.*PRIVATE KEY" .

# Generic high-entropy strings em .env
grep -rE "^[A-Z_]+=['\"]?[A-Za-z0-9/+=]{32,}['\"]?$" --include=".env*"

# Tokens em URLs
grep -rE "://[^/]+:[^@]+@" .
```

### 2. Classifique os achados

Para cada secret detectado:

| Onde | Severidade |
|---|---|
| Working tree (não commitado ainda) | 🟡 — só remover do diff, não vazou |
| Commit local não-pushado | 🟠 — `git reset` ou `commit --amend`, depois rotacionar por garantia |
| Commit pushed pra repo privado | 🔴 — rotacionar + limpar histórico |
| Commit pushed pra repo público | 🔴🔴 — rotacionar IMEDIATAMENTE + assumir comprometido |

### 3. Rotacione o secret (ANTES de limpar o git)

Pra cada credencial encontrada:

1. **Acesse o provider** (AWS Console, Stripe Dashboard, GitHub Settings, etc.)
2. **Gere nova chave** com mesmas permissões
3. **Substitua** em todos os ambientes (local, staging, prod, CI)
4. **Revogue/desabilite** a chave antiga — confirme que o app continua funcionando com a nova
5. **Audite logs do provider** pra ver se houve uso suspeito da chave antiga

Comum esquecer:
- Variável no CI/CD (GitHub Actions, GitLab CI, CircleCI secrets)
- Variável no Vercel/Netlify/Render dashboard
- Hardcoded em script de deploy
- Em `.env.production` no servidor

### 4. Remova do git history (se aplicável)

⚠️ **Avise os colaboradores antes** — você vai reescrever o histórico. Quem tem branch local precisa rebasar.

Opções:

**A) `git filter-repo` (recomendado, moderno):**
```bash
# Instale: pip install git-filter-repo
git filter-repo --path .env --invert-paths   # remove arquivo
git filter-repo --replace-text patterns.txt  # substitui strings
```

Onde `patterns.txt`:
```
sk_live_abc123==>REDACTED
AKIA1234567==>REDACTED
```

**B) BFG Repo-Cleaner (mais simples pra arquivos):**
```bash
bfg --delete-files .env
bfg --replace-text patterns.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

Depois:
```bash
git push --force-with-lease origin --all
git push --force-with-lease origin --tags
```

⚠️ **Force push em main**: só faça com autorização do time. Em repos compartilhados, comunique antes.

### 5. Adicione ao .gitignore

```gitignore
# Secrets
.env
.env.*
!.env.example
*.pem
*.key
.aws/credentials
config/secrets.yml
```

Commite o `.gitignore` atualizado.

### 6. Adicione hook de pré-commit

Pra prevenir reincidência, instale `gitleaks` como hook:

```bash
# Com pre-commit framework (.pre-commit-config.yaml)
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

Ou manualmente em `.git/hooks/pre-commit`:
```bash
#!/bin/sh
gitleaks protect --staged --no-banner || exit 1
```

### 7. Adicione gate no CI

GitHub Actions:
```yaml
name: Gitleaks
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Output esperado

Apresente ao usuário:

1. **Lista de secrets encontrados** com arquivo + commit hash + tipo
2. **Plano de remediação por secret**:
   - Provider onde rotacionar
   - Comandos pra limpar git
   - Onde mais a chave pode estar (CI, deploy, etc.)
3. **Hooks/CI** pra prevenir reincidência
4. **Lembrete final**: rotacionar é obrigatório, limpar git é cosmético
