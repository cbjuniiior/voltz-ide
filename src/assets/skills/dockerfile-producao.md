---
name: dockerfile-producao
description: Generate a production-ready Dockerfile with multi-stage build, small image size, security hardening, and proper caching. Use this skill when the user asks for a "Dockerfile", "containerizar", "container", "docker build", "imagem Docker", or wants to dockerize a Node, Python, Go, Ruby, or static web app.
---

# Dockerfile pronto pra produção

Esta skill gera um Dockerfile que:
- **Multi-stage build** — imagem final mínima (sem deps de build)
- **Cache eficiente** — rebuild rápido quando só código muda
- **Seguro** — user não-root, sem secrets, sem `latest`
- **Pequeno** — base alpine/distroless quando possível
- **Observável** — healthcheck definido

## Quando ativar

- Pedido explícito de Dockerfile
- "Como containerizo isso?"
- App vai pra produção sem ainda ter container

## Diagnóstico antes de gerar

Pergunte (ou descubra do código):
- **Stack**: Node? Python? Go? Static (Vite/Next build estático)?
- **Manager**: npm/pnpm/yarn/bun? pip/poetry/uv?
- **Comando de start em prod**?
- **Porta exposta**?
- **Precisa de assets compilados em build time**? (TypeScript, Sass, Vite)
- **Healthcheck endpoint**? (geralmente `/health` ou `/healthz`)

## Templates por stack

### Node.js (TypeScript, build necessário)

```dockerfile
# syntax=docker/dockerfile:1.7
# ---- 1) Dependências ----
FROM node:20-alpine AS deps
WORKDIR /app
# Aproveita cache: copia só o que define deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- 2) Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Prune devDeps pra runtime
RUN npm prune --omit=dev

# ---- 3) Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# User não-root
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Next.js (standalone output)

Garanta `next.config.js` com `output: 'standalone'`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

### Python (FastAPI / Django com poetry ou uv)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS build
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --user -r requirements.txt

# ---- Runtime ----
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PATH=/home/app/.local/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --shell /bin/bash app

COPY --from=build --chown=app:app /root/.local /home/app/.local
COPY --chown=app:app . .

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Go (binário estático)

Imagem final 5-15 MB:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/app ./cmd/server

# Distroless: ~20MB, sem shell, sem package manager
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/app /app
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
```

### Static SPA (Vite, Astro, Next export)

Nginx como server estático:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Config custom: SPA fallback + gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/ || exit 1
```

`nginx.conf`:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/css text/javascript application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache forte pros assets com hash no filename
    location ~* \.(js|css|woff2?|png|jpg|svg|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## .dockerignore obrigatório

Reduz build context e evita vazar coisas:

```gitignore
node_modules
.git
.env
.env.*
*.log
dist
build
coverage
.next
.nuxt
__pycache__
*.pyc
.venv
.DS_Store
```

## Checklist final

- [ ] Multi-stage build (não fica deps de build na imagem final)
- [ ] Imagem base **fixada por versão** (não `:latest`)
- [ ] User **não-root** rodando o processo
- [ ] `HEALTHCHECK` definido
- [ ] `.dockerignore` exclui `.env`, `.git`, `node_modules`
- [ ] Sem `apt-get update` sem `&& rm -rf /var/lib/apt/lists/*` no final
- [ ] Sem `ADD` (use `COPY`); sem `EXPOSE` sem motivo (informativo)
- [ ] Variáveis de ambiente sensíveis NÃO via `ENV` — via runtime
- [ ] Imagem final < 200MB pra serviços HTTP (idealmente 50-100MB)
- [ ] Build determinístico (lockfile commitado)

## Build e push

```bash
docker build -t app:1.0.0 -t app:latest .
docker run --rm -p 3000:3000 app:1.0.0
# Ver tamanho
docker images app
# Audit
docker scout cves app:1.0.0
```

## Erros comuns a evitar

- ❌ `COPY . .` antes de `npm install` — invalida cache a cada mudança de código
- ❌ Rodar como root em prod
- ❌ Esquecer de copiar `node_modules` no stage final
- ❌ Usar `npm install` em vez de `npm ci` em CI/build
- ❌ Multi-stage sem `--from=stage` (anula o benefício)
- ❌ `latest` tag — quebra reproducibilidade
