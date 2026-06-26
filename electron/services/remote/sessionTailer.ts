import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sessionsInDir } from '../claudeSessions';
import { parseSessionLines, type ParsedTurn } from './sessionParse';
import { rlog } from './diag';

/** Diretórios de config do Claude a vasculhar (conta padrão + contas secundárias). */
async function configDirs(): Promise<string[]> {
  const dirs = [path.join(os.homedir(), '.claude')];
  // Contas secundárias do app ficam em ~/.voltzide/claude-accounts (e ~/.voltz por compat).
  for (const baseName of ['.voltzide', '.voltz']) {
    const base = path.join(os.homedir(), baseName, 'claude-accounts');
    try {
      for (const s of await fs.readdir(base)) dirs.push(path.join(base, s));
    } catch { /* sem essa base */ }
  }
  return dirs;
}

/**
 * Acompanha o `.jsonl` da sessão MAIS RECENTE de um projeto (em qualquer conta) e
 * devolve as linhas novas. Re-resolve a cada poll, então **troca automaticamente**
 * quando o usuário/bot inicia uma sessão nova (caso clássico do auto-start).
 */
export class SessionTailer {
  private file: string | null = null;
  private offset = 0;
  private bornAt = Date.now();

  constructor(private projectPath: string) {}

  /** Sessão `.jsonl` mais recente do projeto entre todas as contas. */
  private async resolveFile(): Promise<{ file: string; mtimeMs: number } | null> {
    let best: { file: string; mtimeMs: number } | null = null;
    for (const dir of await configDirs()) {
      try {
        for (const s of await sessionsInDir(dir, this.projectPath)) {
          if (!best || s.mtimeMs > best.mtimeMs) best = { file: s.file, mtimeMs: s.mtimeMs };
        }
      } catch { /* ignore */ }
    }
    return best;
  }

  async poll(): Promise<ParsedTurn | null> {
    const tag = path.basename(this.projectPath);
    const newest = await this.resolveFile();
    if (!newest) { rlog(`[tailer ${tag}] nenhum arquivo de sessão encontrado`); return null; }

    if (newest.file !== this.file) {
      const firstSeen = this.file === null;
      this.file = newest.file;
      // Só pula o histórico se for uma sessão ANTIGA vista no boot (anterior ao tailer).
      // Sessão nova/recente (auto-start, ou criada agora) é lida desde o começo.
      if (firstSeen && newest.mtimeMs < this.bornAt - 3000) {
        const st = await fs.stat(this.file).catch(() => null);
        this.offset = st?.size ?? 0;
        rlog(`[tailer ${tag}] 1ª resolução (sessão antiga) → começa do fim, offset=${this.offset}, file=${path.basename(this.file)}`);
        return null;
      }
      this.offset = 0;
      rlog(`[tailer ${tag}] troca p/ arquivo (lê do 0): ${path.basename(this.file)} mtime=${new Date(newest.mtimeMs).toLocaleTimeString()}`);
    }

    const stat = await fs.stat(this.file).catch(() => null);
    if (!stat || stat.size <= this.offset) return null;
    const fh = await fs.open(this.file, 'r');
    try {
      const len = stat.size - this.offset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, this.offset);
      this.offset = stat.size;
      const parsed = parseSessionLines(buf.toString('utf8').split('\n'));
      rlog(`[tailer ${tag}] leu ${len} bytes → textLen=${parsed.assistantText.length} tools=${parsed.toolSummaries.length}`);
      return (parsed.assistantText || parsed.toolSummaries.length) ? parsed : null;
    } finally {
      await fh.close();
    }
  }
}
