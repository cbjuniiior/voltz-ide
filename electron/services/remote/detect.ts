// Regexes portadas de src/components/TerminalPane.tsx (manter em sincronia).
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const CLAUDE_ACTIVITY_RE = /[✻✶✷✸✹✺●]|esc to interrupt/i;
const CLAUDE_APPROVAL_RE = /(?:Do you want to|Would you like to|❯\s*1\.\s*Yes|\n\s*1\.\s*Yes\b|\(y\/n\)|press\s+y\b|Esc to cancel)/i;
// Marcadores de que aquele terminal está rodando o Claude Code (banner, spinner,
// "esc to interrupt" ou o cabeçalho do modelo). Usado para NÃO injetar prompt num
// shell cru (PowerShell) e para saber quando o Claude ficou pronto.
const CLAUDE_PRESENCE_RE = /Claude Code|esc to interrupt|[✻✶✷✸✹✺]|\b(?:Opus|Sonnet|Haiku|Fable)\s+[\d.]+/i;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function classifyChunk(rawChunk: string): { activity: boolean; approval: boolean } {
  const text = stripAnsi(rawChunk);
  return {
    activity: CLAUDE_ACTIVITY_RE.test(text),
    approval: CLAUDE_APPROVAL_RE.test(text),
  };
}

/** True se o chunk indica que o terminal está rodando o Claude Code. */
export function looksLikeClaude(rawChunk: string): boolean {
  return CLAUDE_PRESENCE_RE.test(stripAnsi(rawChunk));
}
