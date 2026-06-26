import { describe, it, expect } from 'vitest';
import { parseSessionLines } from './sessionParse';

const lines = [
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'text', text: 'Vou editar o arquivo.' },
    { type: 'tool_use', name: 'Edit', input: { file_path: 'src/app.tsx' } },
  ] } }),
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
  ] } }),
  'linha-corrompida-não-json',
];

describe('parseSessionLines', () => {
  it('coleta o texto do assistant', () => {
    expect(parseSessionLines(lines).assistantText).toContain('Vou editar o arquivo.');
  });
  it('resume tool_use de Edit com o arquivo', () => {
    const s = parseSessionLines(lines).toolSummaries.join('\n');
    expect(s).toContain('Edit');
    expect(s).toContain('src/app.tsx');
  });
  it('resume tool_use de Bash com o comando', () => {
    const s = parseSessionLines(lines).toolSummaries.join('\n');
    expect(s).toContain('npm test');
  });
  it('ignora linhas que não são JSON', () => {
    expect(() => parseSessionLines(lines)).not.toThrow();
  });
});
