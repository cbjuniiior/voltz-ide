---
name: security-review-owasp
description: Audit code changes against the OWASP Top 10 and common web security flaws before shipping. Use this skill when the user asks for a "security review", "revisão de segurança", "audit", "auditoria", "is this safe?", "está seguro?", or before merging changes that touch authentication, authorisation, payments, file uploads, user input, secrets, or external APIs.
---

# Security review — OWASP Top 10 e além

Esta skill faz uma auditoria de segurança focada nas vulnerabilidades **mais comuns e mais exploradas** em apps web. Não é um pentest completo — é o filtro que você passa antes de mergear código sensível.

## Quando ativar

- Antes de mergear código que toca em: **auth, autorização, pagamento, upload, input do usuário, secrets, integração com API externa**
- Quando o usuário pede "review de segurança", "isso é seguro?", "tem furo?"
- Antes de subir para produção uma feature nova com superfície de ataque

## Escopo da revisão (OWASP Top 10 — 2021, ainda válido)

### A01 — Broken Access Control
**O que checar:**
- Toda rota/endpoint tem **autorização explícita** (não só autenticação)?
- O ID do recurso na URL é verificado **contra o usuário logado**? (IDOR — Insecure Direct Object Reference)
  - ❌ `GET /api/orders/:id` que retorna sem checar `order.userId === currentUser.id`
- Roles/permissões verificadas **no servidor**, nunca apenas no front?
- Endpoints administrativos protegidos por **role check**?

**Padrão seguro:**
```ts
const order = await db.orders.findUnique({ where: { id, userId: ctx.user.id } });
if (!order) throw new ForbiddenError();
```

### A02 — Cryptographic Failures
- **Senhas** armazenadas com `bcrypt` / `argon2` (não MD5, SHA1, ou plaintext)
- **HTTPS** obrigatório (HSTS header, no mixed content)
- **Secrets** (API keys, JWT secret, DB password) **fora do código** — env vars + secret manager
- **JWT**: algoritmo fixo no servidor (`HS256` ou `RS256`), nunca `none`; expira em < 1h pro access token
- **Dados sensíveis em log**? PII, token, password → mascarar ou não logar

### A03 — Injection
**SQL injection:**
- Consultas usando **prepared statements** / ORM — NUNCA concatenação de string
- ❌ `db.query("SELECT * FROM users WHERE email = '" + email + "'")`
- ✅ `db.query("SELECT * FROM users WHERE email = ?", [email])`

**XSS (Cross-Site Scripting):**
- React/Vue/Svelte escapam por padrão — mas `dangerouslySetInnerHTML` / `v-html` é vetor
- Conteúdo do usuário renderizado como HTML → sanitizar com `DOMPurify`
- URLs do usuário em `href`: validar protocolo (`javascript:` é XSS)

**Command injection:**
- ❌ `exec('git log ' + userInput)` 
- ✅ `execFile('git', ['log', '--', userInput])` com input validado

### A04 — Insecure Design
- Endpoints de **reset de senha**: token único, expira, single-use, com rate limit
- **Rate limiting** em endpoints de autenticação, captura de lead, OTP
- **Account enumeration**: erro de login não diz "email não existe" vs "senha errada" — uma mensagem só
- **Logout** invalida sessão no servidor (não só limpa cookie no cliente)

### A05 — Security Misconfiguration
- **CORS**: `Access-Control-Allow-Origin` específico, não `*` em endpoints com cookie
- **Headers** de segurança:
  - `Content-Security-Policy` (CSP) com `default-src 'self'`
  - `X-Frame-Options: DENY` ou `frame-ancestors 'none'`
  - `Strict-Transport-Security` (HSTS)
  - `X-Content-Type-Options: nosniff`
- **Stack traces** não vazam em produção
- **Endpoints de debug** (`/health`, `/metrics`, `/admin`) protegidos ou removidos

### A06 — Vulnerable Components
- `npm audit` / `pnpm audit` / `cargo audit` rodando em CI?
- Deps desatualizadas há > 6 meses? Auditar.
- Bibliotecas com CVEs ativos? Atualizar ou substituir.

### A07 — Authentication Failures
- **Brute force** mitigado: rate limit + CAPTCHA após N tentativas
- **Password policy** mínima: comprimento ≥ 12 (não complexity rules absurdos)
- **Session token** rotaciona após login
- **MFA** disponível pra contas sensíveis
- **OAuth**: `state` parameter validado (CSRF), `nonce` em OIDC

### A08 — Software & Data Integrity Failures
- **CI/CD**: artifacts assinados? builds reproducíveis?
- **Deserialization** de dados não confiáveis: nunca `pickle.loads`, `yaml.load` (use `safe_load`)
- **Auto-update**: assinatura verificada antes de aplicar

### A09 — Logging & Monitoring Failures
- Tentativas de login (sucesso e falha) logadas
- Acesso a recurso de outro usuário (IDOR) loga e alerta
- Mudança de permissão de usuário loga quem fez

### A10 — SSRF (Server-Side Request Forgery)
- Backend faz `fetch(userProvidedUrl)`?
  - URL validada contra **allowlist** (não blocklist)?
  - IPs internos (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.x`, `metadata.google.internal`) bloqueados?
  - Redirects seguidos com nova validação?

## Checks extras (não-OWASP mas críticos)

### LGPD / GDPR
- **Consentimento** explícito antes de coletar PII
- **Direito ao esquecimento**: existe rota / processo pra apagar dados?
- **Logs com PII** têm retenção definida?
- **Política de privacidade** linkada e atualizada

### Pagamento (PCI DSS lite)
- Cartão NUNCA toca seu servidor — use **tokenização** (Stripe.js, Pagar.me iframe)
- Webhooks de pagamento validados com **assinatura** (não confie em "veio do gateway")
- Valor da cobrança calculado no **servidor**, não confie no `amount` que veio do front

### Upload de arquivo
- **Tipo** validado por magic bytes (não só extensão / mime)
- **Tamanho** limitado no servidor
- **Storage** fora do webroot
- **Nome** sanitizado (`../../../etc/passwd` não pode ser nome de arquivo)
- Servido com `Content-Disposition: attachment` pra tipos perigosos

## Formato do report

```markdown
## Resumo
[X vulnerabilidades críticas, Y altas, Z médias]

## 🔴 Críticas (corrigir antes de subir)
- **arquivo.ts:42** — [vulnerabilidade]. **Vetor**: [como exploit]. **Fix**: [solução concreta]

## 🟠 Altas (corrigir essa semana)
[idem]

## 🟡 Médias / hardening
[idem]

## ✅ Bem implementado
[reconheça padrões bons]
```

## Recursos
- OWASP Top 10: https://owasp.org/Top10/
- OWASP Cheat Sheets: https://cheatsheetseries.owasp.org/
- LGPD: lei 13.709/2018
