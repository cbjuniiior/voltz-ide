import { describe, it, expect } from 'vitest';
import { mdToTelegramHtml } from './htmlFormat';

describe('mdToTelegramHtml', () => {
  it('converte **negrito** em <b> sem quebrar o resto', () => {
    const out = mdToTelegramHtml('**O que fiz:**\n- Adicionei uma regra em index.css');
    expect(out).toContain('<b>O que fiz:</b>');
    expect(out).toContain('- Adicionei uma regra em index.css');
  });

  it('converte *itálico* mas poupa snake_case', () => {
    expect(mdToTelegramHtml('isso é *importante*')).toContain('<i>importante</i>');
    expect(mdToTelegramHtml('o arquivo login_field aqui')).toBe('o arquivo login_field aqui');
  });

  it('protege code spans e blocos, escapando o conteúdo', () => {
    expect(mdToTelegramHtml('use `input.login-field`')).toContain('<code>input.login-field</code>');
    const block = mdToTelegramHtml('```css\n.a { color: red }\n```');
    expect(block).toContain('<pre>');
    expect(block).toContain('.a { color: red }');
  });

  it('não estraga números nem markup dentro de código', () => {
    // o bug do sentinela: dígitos soltos não podem virar placeholder
    expect(mdToTelegramHtml('porta 5173 e nota 4.5')).toBe('porta 5173 e nota 4.5');
    expect(mdToTelegramHtml('`a*b*c`')).toContain('<code>a*b*c</code>'); // markdown dentro de code fica literal
  });

  it('escapa < > & fora de código', () => {
    expect(mdToTelegramHtml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('títulos viram negrito', () => {
    expect(mdToTelegramHtml('## Resumo')).toBe('<b>Resumo</b>');
  });
});
