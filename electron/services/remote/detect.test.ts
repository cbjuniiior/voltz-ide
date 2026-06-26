import { describe, it, expect } from 'vitest';
import { stripAnsi, classifyChunk, looksLikeClaude } from './detect';

describe('stripAnsi', () => {
  it('remove sequências CSI', () => {
    expect(stripAnsi('\x1b[31mhi\x1b[0m')).toBe('hi');
  });
});

describe('classifyChunk', () => {
  it('detecta atividade pelo spinner', () => {
    expect(classifyChunk('✻ Working…').activity).toBe(true);
  });
  it('detecta atividade por "esc to interrupt"', () => {
    expect(classifyChunk('… (esc to interrupt)').activity).toBe(true);
  });
  it('detecta aprovação por "1. Yes"', () => {
    expect(classifyChunk('❯ 1. Yes\n  2. No').approval).toBe(true);
  });
  it('detecta aprovação por (y/n)', () => {
    expect(classifyChunk('Proceed? (y/n)').approval).toBe(true);
  });
  it('texto comum não é atividade nem aprovação', () => {
    const r = classifyChunk('apenas um output normal');
    expect(r.activity).toBe(false);
    expect(r.approval).toBe(false);
  });
});

describe('looksLikeClaude', () => {
  it('detecta o cabeçalho do modelo', () => {
    expect(looksLikeClaude('Opus 4.8 (1M context) · Claude Max')).toBe(true);
  });
  it('detecta o spinner', () => {
    expect(looksLikeClaude('✻ Pensando…')).toBe(true);
  });
  it('detecta "esc to interrupt"', () => {
    expect(looksLikeClaude('… esc to interrupt')).toBe(true);
  });
  it('um prompt do PowerShell NÃO é Claude', () => {
    expect(looksLikeClaude('PS C:\\Users\\Cassio\\projeto>')).toBe(false);
  });
});
