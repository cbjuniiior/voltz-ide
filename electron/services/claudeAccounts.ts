import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const pExec = promisify(execFile);

/** Diretório de config padrão do Claude Code (conta "principal"). */
export function defaultClaudeDir(): string {
  return path.join(os.homedir(), '.claude');
}

/** Base onde guardamos os dirs das contas adicionais. */
export function accountsBaseDir(): string {
  return path.join(os.homedir(), '.voltzide', 'claude-accounts');
}

export interface AccountIdentity {
  connected: boolean;        // tem credenciais válidas
  tier: string | null;       // ex.: default_claude_max_20x
  planLabel: string | null;  // "Max 20x"
  email: string | null;
  orgName: string | null;
  expiresAt: number | null;
}

function tierToLabel(tier: string | null): string | null {
  if (!tier) return null;
  if (/max_20x/i.test(tier)) return 'Max 20x';
  if (/max_5x/i.test(tier)) return 'Max 5x';
  if (/max/i.test(tier)) return 'Max';
  if (/pro/i.test(tier)) return 'Pro';
  if (/free/i.test(tier)) return 'Free';
  return tier;
}

/**
 * Nome do serviço no Keychain do macOS para um config dir. O Claude Code chaveia
 * as credenciais POR config dir:
 *  - dir padrão (~/.claude): serviço base "Claude Code-credentials".
 *  - dirs custom (CLAUDE_CONFIG_DIR): "Claude Code-credentials-<hash>", onde
 *    <hash> = primeiros 8 hex do sha256 do caminho absoluto do dir.
 * (Verificado por engenharia reversa: sha256(dir).slice(0,8) bate com o sufixo.)
 */
function keychainServiceFor(dir: string): string {
  const base = 'Claude Code-credentials';
  if (path.resolve(dir) === path.resolve(defaultClaudeDir())) return base;
  const hash = crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

/**
 * No macOS o Claude Code guarda as credenciais no Keychain (não em arquivo). O
 * blob é o mesmo JSON do .credentials.json. Cada conta (config dir) tem a sua
 * entrada — ver keychainServiceFor.
 */
async function readKeychainCreds(dir: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await pExec(
      'security',
      ['find-generic-password', '-s', keychainServiceFor(dir), '-w'],
      { timeout: 5000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Token de acesso de uma conta (arquivo, com fallback no Keychain no macOS). */
export async function readAccessToken(dir: string): Promise<string | null> {
  return (await readCreds(dir)).token;
}

async function readCreds(dir: string): Promise<{ token: string | null; tier: string | null; expiresAt: number | null }> {
  let raw: string | null = null;
  try {
    raw = await fs.readFile(path.join(dir, '.credentials.json'), 'utf8');
  } catch {
    // Sem arquivo (Linux/Windows): no macOS as credenciais ficam no Keychain,
    // com uma entrada por config dir (principal e secundárias).
    raw = await readKeychainCreds(dir);
  }
  if (!raw) return { token: null, tier: null, expiresAt: null };
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string; rateLimitTier?: string; expiresAt?: number };
    };
    const o = parsed.claudeAiOauth;
    return { token: o?.accessToken ?? null, tier: o?.rateLimitTier ?? null, expiresAt: o?.expiresAt ?? null };
  } catch {
    return { token: null, tier: null, expiresAt: null };
  }
}

async function fetchProfile(token: string): Promise<{ email: string | null; orgName: string | null } | null> {
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/profile', {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    });
    if (!r.ok) return null;
    const d = await r.json() as { account?: { email?: string }; organization?: { name?: string } };
    return { email: d.account?.email ?? null, orgName: d.organization?.name ?? null };
  } catch {
    return null;
  }
}

/** Identidade de uma conta a partir do seu dir de config. */
export async function getAccountIdentity(dir: string): Promise<AccountIdentity> {
  const { token, tier, expiresAt } = await readCreds(dir);
  if (!token) {
    return { connected: false, tier: null, planLabel: null, email: null, orgName: null, expiresAt: null };
  }
  const profile = await fetchProfile(token);
  return {
    connected: true,
    tier,
    planLabel: tierToLabel(tier),
    email: profile?.email ?? null,
    orgName: profile?.orgName ?? null,
    expiresAt,
  };
}

// Config copiada para a conta nova (tudo menos credenciais e a identidade da
// conta principal — `.claude.json` NÃO é copiado de propósito, pra não levar o
// oauthAccount/userID da conta principal e confundir o login da nova).
const SEED_FILES = ['settings.json', 'mcp.json', 'CLAUDE.md'];
const SEED_DIRS = ['commands', 'skills', 'plugins'];

/** Cria (e popula) o dir de uma conta nova. Não toca em credenciais. */
export async function createAccountDir(id: string): Promise<string> {
  const dir = path.join(accountsBaseDir(), id);
  await fs.mkdir(dir, { recursive: true });
  const src = defaultClaudeDir();
  for (const f of SEED_FILES) {
    try { await fs.copyFile(path.join(src, f), path.join(dir, f)); } catch { /* opcional */ }
  }
  for (const d of SEED_DIRS) {
    try { await fs.cp(path.join(src, d), path.join(dir, d), { recursive: true }); } catch { /* opcional */ }
  }
  return dir;
}

/** Remove o dir de uma conta — só se estiver dentro da base (segurança). */
export async function removeAccountDir(dir: string): Promise<void> {
  const base = accountsBaseDir();
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) return;
  try { await fs.rm(resolved, { recursive: true, force: true }); } catch { /* ignore */ }
}
