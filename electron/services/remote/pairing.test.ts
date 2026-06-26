import { describe, it, expect } from 'vitest';
import { generatePairingCode, isOwner } from './pairing';

describe('generatePairingCode', () => {
  it('gera 6 dígitos', () => {
    expect(generatePairingCode()).toMatch(/^\d{6}$/);
  });
});

describe('isOwner', () => {
  it('true quando bate o chatId', () => {
    expect(isOwner('123', '123')).toBe(true);
  });
  it('false quando difere', () => {
    expect(isOwner('123', '999')).toBe(false);
  });
  it('false quando não há dono', () => {
    expect(isOwner('123', null)).toBe(false);
  });
});
