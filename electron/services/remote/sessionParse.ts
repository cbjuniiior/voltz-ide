export interface ParsedTurn {
  assistantText: string;
  toolSummaries: string[];
}

interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function summarizeTool(name: string, input: Record<string, unknown> = {}): string {
  const file = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  const cmd = input.command as string | undefined;
  const url = input.url as string | undefined;
  const detail = file ?? cmd ?? url ?? '';
  return detail ? `${name}: ${detail}` : name;
}

export function parseSessionLines(lines: string[]): ParsedTurn {
  const textParts: string[] = [];
  const toolSummaries: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: { type?: string; message?: { content?: ContentItem[] } };
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj.type !== 'assistant') continue;
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        textParts.push(item.text);
      } else if (item.type === 'tool_use' && typeof item.name === 'string') {
        toolSummaries.push(summarizeTool(item.name, item.input));
      }
    }
  }
  return { assistantText: textParts.join('\n\n').trim(), toolSummaries };
}
