---
name: ci-github-actions
description: Set up a complete GitHub Actions CI/CD pipeline with lint, type-check, test, build and deploy. Use this skill when the user asks to "set up CI", "configurar CI", "GitHub Actions", "workflow", "pipeline", "deploy automático", or wants automated quality gates on PRs.
---

# GitHub Actions — CI/CD pronto pra produção

Esta skill configura um pipeline **rápido, paralelo, com cache** que roda em todo PR e push pra `main`. Por padrão: lint → typecheck → test → build (em paralelo onde possível), com deploy condicional.

## Quando ativar

- "Configurar CI", "GitHub Actions", "pipeline"
- Projeto novo sem `.github/workflows/`
- "PRs quebram porque ninguém roda os testes"
- Setup de deploy automático pra Vercel/Netlify/Render/Fly

## Diagnóstico antes de gerar

- **Stack** (Node/Python/Go/etc.)
- **Package manager** (npm/pnpm/yarn/bun)
- **Comandos** (`npm run lint`, `test`, `typecheck`, `build`)
- **Tests**: unit only? E2E? Precisa de DB/Redis em container?
- **Deploy target**: Vercel/Netlify/Render/Fly/AWS/auto-hosted?
- **Branches**: só `main` ou também `develop`?

## Template base — Node + TS (pnpm)

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  install:
    name: Install
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Save pnpm store
        uses: actions/cache@v4
        with:
          path: ~/.local/share/pnpm/store
          key: pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

  lint:
    name: Lint
    needs: install
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    name: Type check
    needs: install
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    name: Test
    needs: install
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --coverage
      - uses: codecov/codecov-action@v4
        if: always()
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    name: Build
    needs: [lint, typecheck, test]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
          retention-days: 7
```

## Adicionais por necessidade

### E2E com Playwright

Job adicional:

```yaml
  e2e:
    name: E2E (Playwright)
    needs: install
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Testes que precisam de Postgres

```yaml
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:test@localhost:5432/test
    steps:
      # ... checkout, setup ...
      - run: pnpm migrate
      - run: pnpm test
```

### Deploy condicional (Vercel)

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Preview deploys em PRs

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        id: vercel
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      - name: Comment PR
        uses: thollander/actions-comment-pull-request@v3
        with:
          message: |
            🚀 Preview: ${{ steps.vercel.outputs.preview-url }}
```

### Security scanning

```yaml
  security:
    name: Security scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: HIGH,CRITICAL
          exit-code: 1
```

## Princípios

### 1. Paralelize tudo que dá
Lint, typecheck e test rodam em paralelo. Build só depois que tudo passa.

### 2. Cache agressivamente
- Cache do package manager (`actions/setup-node` com `cache: pnpm`)
- Cache de build (Playwright browsers, Next .next/cache, etc.)
- Cache do TypeScript incremental (`.tsbuildinfo`)

### 3. Fail-fast
- `concurrency: cancel-in-progress: true` — novo push cancela o anterior
- `timeout-minutes` em todo job (5 pra rápidos, 15 pra E2E)
- Sem `continue-on-error: true` (silencia falhas)

### 4. Reproduzível
- `npm ci` / `pnpm install --frozen-lockfile` (não `install` solto)
- Node version fixa
- Action SHA pinned em jobs sensíveis (security)

### 5. Secrets nunca em logs
- Use `${{ secrets.X }}` (nunca passe em string interpolada visível)
- `env:` em job, não em step com `echo $SECRET`

## Branch protection (Settings → Branches)

Configure em `main`:
- [x] Require pull request before merging
- [x] Require status checks to pass:
  - lint
  - typecheck
  - test
  - build
- [x] Require branches to be up to date
- [x] Require linear history (opcional, evita merge commits)
- [x] Do not allow force pushes

## Checklist final

- [ ] CI roda em push pra main E em PRs
- [ ] Cancel-in-progress configurado
- [ ] Timeout em todos os jobs
- [ ] Cache de deps configurado
- [ ] Status checks marcados como required
- [ ] Deploy só dispara em push pra main, NUNCA em PR
- [ ] Secrets configurados em Settings → Secrets and variables → Actions
- [ ] Não roda E2E desnecessariamente em PR de docs (use `paths-ignore`)
