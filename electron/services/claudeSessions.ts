import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readAccessToken, defaultClaudeDir, accountsBaseDir } from './claudeAccounts';

export interface ClaudeSessionInfo {
  id: string;
  preview: string;
  mtimeMs: number;
  /** Config dir (conta) dona da sessão — o `--resume` precisa apontar pra ela. */
  configDir: string;
}

export interface GlobalClaudeSession extends ClaudeSessionInfo {
  /** Diretório de trabalho da sessão (cwd gravado no transcript). */
  cwd: string | null;
  /** Nome amigável do projeto (basename do cwd). */
  projectName: string;
}

interface TranscriptLine {
  type?: string;
  summary?: string;
  cwd?: string;
  message?: { content?: unknown };
}

/** Como o Claude Code nomeia a pasta do projeto: não-alfanuméricos viram '-'. */
function encode(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-');
}

/** Lê o início do .jsonl e extrai cwd + uma prévia (summary ou 1ª msg do user). */
async function readHead(file: string): Promise<{ cwd: string | null; preview: string }> {
  let cwd: string | null = null;
  let summary = '';
  let firstUser = '';
  try {
    const fh = await fs.open(file, 'r');
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    await fh.close();
    const text = buf.subarray(0, bytesRead).toString('utf8');
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      let obj: TranscriptLine;
      try { obj = JSON.parse(s) as TranscriptLine; } catch { continue; }
      if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;
      if (!summary && obj.type === 'summary' && typeof obj.summary === 'string') summary = obj.summary;
      if (!firstUser && obj.type === 'user' && obj.message) {
        const c = obj.message.content;
        if (typeof c === 'string') firstUser = c;
        else if (Array.isArray(c)) {
          const t = (c as Array<{ text?: unknown }>).find((x) => typeof x?.text === 'string');
          if (t && typeof t.text === 'string') firstUser = t.text;
        }
      }
    }
  } catch { /* ignore */ }
  const preview = (summary || firstUser || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { cwd, preview };
}

const norm = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();

/**
 * Todos os config dirs do Claude conhecidos: o padrão (~/.claude) + o dir de
 * cada conta Voltz (~/.voltz/claude-accounts/*). As sessões de um terminal são
 * gravadas no CLAUDE_CONFIG_DIR da conta dele, então a busca precisa cobrir todos.
 */
async function allConfigDirs(): Promise<string[]> {
  const dirs = [defaultClaudeDir()];
  try {
    const base = accountsBaseDir();
    for (const name of await fs.readdir(base)) dirs.push(path.join(base, name));
  } catch { /* sem contas adicionais */ }
  return dirs;
}

/** Acha TODAS as pastas de sessões do projeto (case-insensitive — o Claude grava
 *  a mesma raiz com cases diferentes às vezes, ex.: `c:\` vs `C:\`). */
async function findProjectDirs(base: string, dirs: string[], projectPath: string): Promise<string[]> {
  const wanted = encode(projectPath).toLowerCase();
  const direct = dirs.filter((d) => d.toLowerCase() === wanted);
  if (direct.length) return direct;
  // Fallback: compara o cwd gravado no transcript com o projectPath atual.
  const target = norm(projectPath);
  const out: string[] = [];
  for (const d of dirs) {
    try {
      const files = (await fs.readdir(path.join(base, d))).filter((f) => f.endsWith('.jsonl'));
      if (!files.length) continue;
      const head = await readHead(path.join(base, d, files[0]));
      if (head.cwd && norm(head.cwd) === target) out.push(d);
    } catch { /* ignore */ }
  }
  return out;
}

/** A melhor pasta única do projeto (a que tem o transcript mais recente). */
async function findProjectDir(base: string, dirs: string[], projectPath: string): Promise<string | null> {
  const matches = await findProjectDirs(base, dirs, projectPath);
  if (matches.length <= 1) return matches[0] ?? null;
  let best: { dir: string; mtimeMs: number } | null = null;
  for (const d of matches) {
    try {
      for (const f of (await fs.readdir(path.join(base, d))).filter((x) => x.endsWith('.jsonl'))) {
        const st = await fs.stat(path.join(base, d, f));
        if (!best || st.mtimeMs > best.mtimeMs) best = { dir: d, mtimeMs: st.mtimeMs };
      }
    } catch { /* ignore */ }
  }
  return best?.dir ?? matches[0];
}

/** "claude-opus-4-8" → "Opus 4.8"; "claude-fable-5" → "Fable 5". */
function friendlyModel(id: string): string | null {
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:[-.](\d+))?/i.exec(id);
  if (!m) return null;
  const fam = m[1][0].toUpperCase() + m[1].slice(1);
  const ver = m[3] ? `${m[2]}.${m[3]}` : m[2];
  return `${fam} ${ver}`;
}

/**
 * Modelo realmente em uso no projeto: lê o transcript da sessão mais recente e
 * pega o `message.model` da última mensagem do assistant. 100% confiável (é o
 * que o Claude gravou), ao contrário de parsear o banner do terminal.
 */
export async function getCurrentModel(projectPath: string, configDir?: string): Promise<string | null> {
  const base = path.join(configDir || path.join(os.homedir(), '.claude'), 'projects');
  let dirs: string[];
  try { dirs = await fs.readdir(base); } catch { return null; }
  const dir = await findProjectDir(base, dirs, projectPath);
  if (!dir) return null;

  let files: Array<{ f: string; mtimeMs: number }> = [];
  try {
    const names = (await fs.readdir(path.join(base, dir))).filter((f) => f.endsWith('.jsonl'));
    for (const f of names) {
      try { const st = await fs.stat(path.join(base, dir, f)); files.push({ f, mtimeMs: st.mtimeMs }); }
      catch { /* ignore */ }
    }
  } catch { return null; }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Procura nas 2 sessões mais recentes (da mais nova para a mais antiga).
  for (const { f } of files.slice(0, 2)) {
    try {
      const st = await fs.stat(path.join(base, dir, f));
      if (st.size > 25 * 1024 * 1024) continue;
      const text = await fs.readFile(path.join(base, dir, f), 'utf8');
      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const s = lines[i].trim();
        if (!s || !s.includes('"model"')) continue;
        let obj: { model?: string; message?: { model?: string } };
        try { obj = JSON.parse(s); } catch { continue; }
        const id = obj.message?.model ?? obj.model;
        if (typeof id === 'string') {
          const label = friendlyModel(id);
          if (label) return label;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

export interface UsageWindow {
  key: string;
  label: string;
  utilization: number;        // 0–100
  resetsAt: string | null;    // ISO 8601
}

export interface ClaudeUsage {
  ok: boolean;
  windows: UsageWindow[];
  extraUsage?: { enabled: boolean; utilization: number | null } | null;
  error?: string;
}

const USAGE_WINDOW_LABELS: Record<string, string> = {
  five_hour: 'Sessão · 5h',
  seven_day: 'Semanal · 7 dias',
  seven_day_opus: 'Semanal · Opus',
  seven_day_sonnet: 'Semanal · Sonnet',
};
// Ordem de exibição.
const USAGE_WINDOW_ORDER = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];

/**
 * Uso real do plano (limites do Claude Max), buscado do mesmo endpoint OAuth que
 * o /status do Claude Code consome — janelas de 5h, 7 dias e 7 dias por modelo,
 * cada uma com % de utilização e horário de reset. Usa o token da conta
 * (arquivo .credentials.json ou Keychain no macOS).
 */
export async function getClaudeUsage(configDir?: string): Promise<ClaudeUsage> {
  const dir = configDir || path.join(os.homedir(), '.claude');
  // Token via readAccessToken: arquivo .credentials.json ou, no macOS, Keychain
  // (entrada por config dir — principal e secundárias).
  const token = await readAccessToken(dir);
  if (!token) return { ok: false, windows: [], error: 'sem-credenciais' };

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    });
    if (!res.ok) return { ok: false, windows: [], error: `http-${res.status}` };
    const data = await res.json() as Record<string, { utilization?: number; resets_at?: string | null } | null> & {
      extra_usage?: { is_enabled?: boolean; utilization?: number | null } | null;
    };

    const windows: UsageWindow[] = [];
    for (const key of USAGE_WINDOW_ORDER) {
      const w = data[key];
      if (w && typeof w.utilization === 'number') {
        windows.push({
          key,
          label: USAGE_WINDOW_LABELS[key] ?? key,
          utilization: w.utilization,
          resetsAt: w.resets_at ?? null,
        });
      }
    }

    const eu = data.extra_usage;
    const extraUsage = eu ? { enabled: !!eu.is_enabled, utilization: eu.utilization ?? null } : null;
    return { ok: true, windows, extraUsage };
  } catch (e) {
    return { ok: false, windows: [], error: (e as Error).message };
  }
}

/** Sessões de um projeto dentro de UM config dir (resolve a pasta codificada). */
export async function sessionsInDir(configDir: string, projectPath: string): Promise<Array<{ id: string; file: string; mtimeMs: number }>> {
  const base = path.join(configDir, 'projects');
  let dirs: string[];
  try { dirs = await fs.readdir(base); } catch { return []; }
  // Agrega TODAS as pastas do projeto (cases diferentes do mesmo caminho).
  const matchDirs = await findProjectDirs(base, dirs, projectPath);
  const out: Array<{ id: string; file: string; mtimeMs: number }> = [];
  for (const matchDir of matchDirs) {
    const dirFull = path.join(base, matchDir);
    let files: string[];
    try { files = (await fs.readdir(dirFull)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      try {
        const st = await fs.stat(path.join(dirFull, f));
        out.push({ id: f.replace(/\.jsonl$/, ''), file: path.join(dirFull, f), mtimeMs: st.mtimeMs });
      } catch { /* ignore */ }
    }
  }
  return out;
}

/**
 * Sessões de um projeto. Com `configDir` → só aquela conta (escopo correto para
 * o `--resume` do terminal). Sem `configDir` → varre o padrão + todas as contas
 * (uso informativo, ex.: Inspector).
 */
export async function listClaudeSessions(projectPath: string, configDir?: string): Promise<ClaudeSessionInfo[]> {
  const bases = configDir ? [configDir] : await allConfigDirs();
  const collected: Array<{ id: string; file: string; mtimeMs: number; configDir: string }> = [];
  for (const b of bases) for (const s of await sessionsInDir(b, projectPath)) collected.push({ ...s, configDir: b });

  // Dedupe por id (mesma sessão não aparece 2x) e ordena por data.
  const byId = new Map<string, { id: string; file: string; mtimeMs: number; configDir: string }>();
  for (const s of collected) {
    const prev = byId.get(s.id);
    if (!prev || s.mtimeMs > prev.mtimeMs) byId.set(s.id, s);
  }
  const top = [...byId.values()].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 25);

  const out: ClaudeSessionInfo[] = [];
  for (const s of top) {
    out.push({ id: s.id, mtimeMs: s.mtimeMs, preview: (await readHead(s.file)).preview, configDir: s.configDir });
  }
  return out;
}

/**
 * Lista as sessões mais recentes do Claude entre TODOS os projetos, ordenadas
 * por data (desc). Lê o head só das `limit` mais recentes para extrair
 * cwd + prévia. Alimenta o painel "Sessões" agrupado por tempo.
 */
export async function listAllClaudeSessions(limit = 60, configDirs?: string[]): Promise<GlobalClaudeSession[]> {
  const bases = configDirs?.length ? configDirs : await allConfigDirs();

  // 1) Coleta (arquivo, mtime) de todas as sessões de todos os config dirs.
  const all: Array<{ file: string; id: string; mtimeMs: number; configDir: string }> = [];
  for (const cfg of bases) {
    const base = path.join(cfg, 'projects');
    let dirs: string[];
    try { dirs = await fs.readdir(base); } catch { continue; }
    for (const d of dirs) {
      const full = path.join(base, d);
      let files: string[];
      try { files = (await fs.readdir(full)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        try {
          const st = await fs.stat(path.join(full, f));
          all.push({ file: path.join(full, f), id: f.replace(/\.jsonl$/, ''), mtimeMs: st.mtimeMs, configDir: cfg });
        } catch { /* ignore */ }
      }
    }
  }

  // 2) Dedupe por id, ordena globalmente e lê o head só das `limit` mais recentes.
  const byId = new Map<string, { file: string; id: string; mtimeMs: number; configDir: string }>();
  for (const s of all) {
    const prev = byId.get(s.id);
    if (!prev || s.mtimeMs > prev.mtimeMs) byId.set(s.id, s);
  }
  const top = [...byId.values()].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);

  const out: GlobalClaudeSession[] = [];
  for (const s of top) {
    const head = await readHead(s.file);
    const projectName = head.cwd
      ? (head.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() ?? head.cwd)
      : 'Projeto desconhecido';
    out.push({ id: s.id, mtimeMs: s.mtimeMs, preview: head.preview, cwd: head.cwd, projectName, configDir: s.configDir });
  }
  return out;
}
