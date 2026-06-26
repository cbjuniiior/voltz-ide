import { spawn } from 'node:child_process';
import { detectClaude } from './claudeDetect';

const PROMPT =
  'Você é um assistente que escreve mensagens de commit. A partir do diff git ' +
  'recebido, gere UMA mensagem de commit curta e clara em português, no formato ' +
  'Conventional Commits quando fizer sentido (ex.: "feat: ...", "fix: ...", "refactor: ..."). ' +
  'Responda APENAS com a mensagem, em uma única linha (máx ~72 caracteres), sem aspas, ' +
  'sem markdown e sem nenhuma explicação adicional.';

export type CommitMsgResult = { ok: true; message: string } | { ok: false; error: string };

/** Gera uma mensagem de commit rodando o Claude em modo headless (`claude -p`)
 *  sobre o diff (enviado via stdin). Usa a conta indicada por configDir. */
export async function generateCommitMessage(diff: string, cwd: string, configDir?: string): Promise<CommitMsgResult> {
  const trimmed = (diff || '').trim();
  if (!trimmed) return { ok: false, error: 'Nada no stage para resumir.' };

  const det = await detectClaude();
  if (!det.path) return { ok: false, error: 'Claude não encontrado. Configure o caminho nas Configurações.' };

  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(det.path);
  const env = { ...process.env };
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;

  return new Promise<CommitMsgResult>((resolve) => {
    let child;
    try {
      child = spawn(det.path!, ['-p', PROMPT], { cwd, env, windowsHide: true, shell: needsShell });
    } catch {
      resolve({ ok: false, error: 'Falha ao executar o Claude.' });
      return;
    }
    let out = '';
    let err = '';
    const killer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 90_000);
    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr.on('data', (b) => { err += b.toString('utf8'); });
    child.on('error', () => { clearTimeout(killer); resolve({ ok: false, error: 'Falha ao executar o Claude.' }); });
    child.on('close', (code) => {
      clearTimeout(killer);
      // Primeira linha não-vazia, sem aspas/cercas de código.
      const msg = out.split('\n').map((l) => l.trim()).find(Boolean)?.replace(/^["'`]+|["'`]+$/g, '').trim() ?? '';
      if (code === 0 && msg) resolve({ ok: true, message: msg.slice(0, 120) });
      else resolve({ ok: false, error: (err.trim() || 'Não consegui gerar a mensagem.').slice(0, 200) });
    });
    try { child.stdin.write(trimmed.slice(0, 12_000)); child.stdin.end(); } catch { /* ignore */ }
  });
}
