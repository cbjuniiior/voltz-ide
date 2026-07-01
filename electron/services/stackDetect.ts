import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Detecta a stack do projeto (leve, por arquivos-marcador) e devolve uma linha
 * curta injetada nas personas via `--append-system-prompt`, pra elas se
 * adaptarem à linguagem/framework/runners reais.
 */
export async function detectStack(projectPath: string): Promise<string> {
  if (!projectPath) return '';
  const has = async (f: string): Promise<boolean> => {
    try { await fs.access(path.join(projectPath, f)); return true; } catch { return false; }
  };
  const readJson = async (f: string): Promise<Record<string, unknown> | null> => {
    try { return JSON.parse(await fs.readFile(path.join(projectPath, f), 'utf8')); } catch { return null; }
  };

  const parts: string[] = [];
  const runners: string[] = [];

  const pkg = await readJson('package.json');
  if (pkg) {
    const deps: Record<string, unknown> = { ...(pkg.dependencies as object ?? {}), ...(pkg.devDependencies as object ?? {}) };
    const has1 = (d: string) => d in deps;
    const fw: string[] = [];
    if (has1('next')) fw.push('Next.js'); else if (has1('react')) fw.push('React');
    if (has1('vue') || has1('nuxt')) fw.push('Vue');
    if (has1('svelte')) fw.push('Svelte');
    if (has1('@angular/core')) fw.push('Angular');
    if (has1('astro')) fw.push('Astro');
    if (has1('express') || has1('fastify') || has1('@nestjs/core')) fw.push('Node backend');
    if (has1('electron')) fw.push('Electron');
    parts.push('Node/JS' + (has1('typescript') ? '/TS' : '') + (fw.length ? ` (${fw.join(', ')})` : ''));
    if (has1('typescript')) runners.push('tsc --noEmit');
    if (has1('eslint')) runners.push('eslint');
    if (has1('vitest')) runners.push('vitest'); else if (has1('jest')) runners.push('jest');
    if (has1('@playwright/test') || has1('playwright')) runners.push('playwright');
    const pm = (await has('pnpm-lock.yaml')) ? 'pnpm' : (await has('yarn.lock')) ? 'yarn' : (await has('bun.lockb')) ? 'bun' : 'npm';
    parts.push(`gerenciador: ${pm}`);
  }
  if ((await has('requirements.txt')) || (await has('pyproject.toml')) || (await has('setup.py'))) {
    parts.push('Python'); runners.push('pytest', 'ruff');
  }
  if (await has('go.mod')) { parts.push('Go'); runners.push('go test ./...', 'go vet ./...'); }
  if (await has('Cargo.toml')) { parts.push('Rust'); runners.push('cargo test', 'cargo clippy'); }
  if (await has('composer.json')) { parts.push('PHP'); runners.push('php -l'); }
  if ((await has('Gemfile'))) { parts.push('Ruby'); runners.push('rspec'); }

  if (parts.length === 0) return '';
  const uniq = [...new Set(runners)];
  return `Contexto do projeto — Stack detectada: ${parts.join(' · ')}. Runners provavelmente disponíveis (confirme antes de usar): ${uniq.join(', ') || '—'}. Adapte suas práticas e comandos a esta stack.`;
}
