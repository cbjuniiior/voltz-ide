import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectClaude } from '../claudeDetect';
import { sessionsInDir } from '../claudeSessions';

export interface HeadlessHandlers {
  /** Bloco de texto que o Claude escreveu. */
  onText: (text: string) => void;
  /** Resumo de uma chamada de ferramenta (Edit/Bash/Read…). */
  onTool: (summary: string) => void;
  /** Turno concluído. `denials` = ferramentas que precisaram de permissão e foram bloqueadas. */
  onDone: (result: string | null, denials: string[]) => void;
  /** Erro (executável não achado, processo falhou…). */
  onError: (msg: string) => void;
}

export interface AskOptions {
  /** Roda com --dangerously-skip-permissions (após o usuário aprovar no Telegram). */
  bypass?: boolean;
}

function summarizeTool(name: string, input: Record<string, unknown> = {}): string {
  const detail = (input.file_path ?? input.path ?? input.command ?? input.url ?? input.pattern ?? '') as string;
  return detail ? `${name}: ${String(detail).slice(0, 100)}` : name;
}

/**
 * Roda o Claude em modo headless (`-p --output-format stream-json`) por pedido,
 * fazendo streaming da saída — sem TUI, sem adivinhar arquivo de sessão.
 * Mantém o `session_id` por projeto para `--resume` (conversa contínua).
 */
export class HeadlessManager {
  private sessionByProject = new Map<string, string>();   // project -> claude session_id (resume)
  private running = new Map<string, ChildProcess>();      // project -> processo ativo
  private claudePath: string | null | undefined;          // undefined = ainda não detectado

  isRunning(project: string): boolean { return this.running.has(project); }

  stop(project: string): boolean {
    const c = this.running.get(project);
    if (!c) return false;
    try { c.kill(); } catch { /* ignore */ }
    this.running.delete(project);
    return true;
  }

  stopAll(): void {
    for (const c of this.running.values()) { try { c.kill(); } catch { /* ignore */ } }
    this.running.clear();
  }

  async ask(project: string, prompt: string, h: HeadlessHandlers, opts: AskOptions = {}): Promise<void> {
    if (this.running.has(project)) { h.onError('Já há um pedido em andamento nesse projeto. Aguarde ou use /stop.'); return; }
    if (this.claudePath === undefined) this.claudePath = (await detectClaude()).path;
    if (!this.claudePath) { h.onError('Não encontrei o executável do Claude. Confira o caminho em Configurações → Claude/IA.'); return; }

    const env: NodeJS.ProcessEnv = { ...process.env };
    const accountDir = await this.resolveAccountDir(project);
    if (accountDir) env.CLAUDE_CONFIG_DIR = accountDir; // mesma conta/auth que o usuário usa no projeto

    // bypass = o usuário aprovou no Telegram → libera tudo nesta continuação.
    const permFlag = opts.bypass ? ['--dangerously-skip-permissions'] : ['--permission-mode', 'acceptEdits'];
    const args = ['--output-format', 'stream-json', '--verbose', ...permFlag];
    const sid = this.sessionByProject.get(project);
    if (sid) args.push('--resume', sid);

    const child = this.spawnClaude(this.claudePath, prompt, args, project, env);
    this.running.set(project, child);

    let buf = '';
    let resultText: string | null = null;
    let sawAnything = false;
    const denials: string[] = [];

    child.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev: {
          type?: string; subtype?: string; session_id?: string; result?: unknown;
          permission_denials?: Array<{ tool_name?: string; tool_input?: Record<string, unknown> }>;
          message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }> };
        };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.session_id) this.sessionByProject.set(project, ev.session_id);
        if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
          for (const item of ev.message!.content!) {
            if (item.type === 'text' && typeof item.text === 'string' && item.text.trim()) { sawAnything = true; h.onText(item.text); }
            else if (item.type === 'tool_use' && typeof item.name === 'string') { sawAnything = true; h.onTool(summarizeTool(item.name, item.input)); }
          }
        } else if (ev.type === 'result') {
          resultText = typeof ev.result === 'string' ? ev.result : null;
          for (const d of ev.permission_denials ?? []) {
            if (d.tool_name) denials.push(summarizeTool(d.tool_name, d.tool_input));
          }
        }
      }
    });

    child.on('error', (e) => { this.running.delete(project); h.onError('Falha ao rodar o Claude: ' + (e as Error).message); });
    child.on('close', () => {
      this.running.delete(project);
      if (!sawAnything && resultText) h.onText(resultText);
      h.onDone(resultText, denials);
    });
  }

  /** Conta (config dir) com a sessão mais recente do projeto — reusa a auth do usuário. */
  private async resolveAccountDir(project: string): Promise<string | null> {
    const dirs = [path.join(os.homedir(), '.claude')];
    for (const baseName of ['.voltzide', '.voltz']) {
      try {
        const base = path.join(os.homedir(), baseName, 'claude-accounts');
        for (const s of await fs.readdir(base)) dirs.push(path.join(base, s));
      } catch { /* sem essa base */ }
    }
    let best: { dir: string; mt: number } | null = null;
    for (const dir of dirs) {
      try { for (const s of await sessionsInDir(dir, project)) if (!best || s.mtimeMs > best.mt) best = { dir, mt: s.mtimeMs }; } catch { /* ignore */ }
    }
    return best?.dir ?? null;
  }

  private spawnClaude(claudePath: string, prompt: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
    // .cmd/.bat no Windows precisa do cmd.exe; aí passamos o prompt por stdin
    // (evita o escaping do cmd). Para o .exe padrão, prompt vai como argumento
    // posicional (spawn sem shell = injeção-seguro).
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudePath)) {
      const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', claudePath, '-p', ...args],
        { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdin?.write(prompt);
      child.stdin?.end();
      return child;
    }
    return spawn(claudePath, ['-p', prompt, ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  }
}
