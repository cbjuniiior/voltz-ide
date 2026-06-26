import { describe, it, expect } from 'vitest';
import { sliceForTelegram, formatApprovalCard } from './messages';

describe('sliceForTelegram', () => {
  it('texto curto vira 1 pedaço', () => {
    expect(sliceForTelegram('oi', 4096)).toEqual(['oi']);
  });
  it('texto longo é fatiado dentro do limite', () => {
    const parts = sliceForTelegram('a'.repeat(10000), 4096);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
  });
  it('string vazia vira lista vazia', () => {
    expect(sliceForTelegram('', 4096)).toEqual([]);
  });
});

describe('formatApprovalCard', () => {
  it('inclui o projeto e o alvo', () => {
    const s = formatApprovalCard('meu-app', 'Bash: rm -rf dist');
    expect(s).toContain('meu-app');
    expect(s).toContain('rm -rf dist');
  });
});
