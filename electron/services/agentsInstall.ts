import fs from 'node:fs/promises';
import path from 'node:path';
import { PERSONAS, PERSONAS_VERSION } from './personaAssets';

/**
 * Instala/gere as personas do Esquadrão em `<configDir>/agents/voltz/<id>.md`.
 * Espelha a mecânica das skills globais: grava em todos os config dirs
 * gerenciados (principal + contas) para valer em qualquer projeto/conta.
 */

function agentsDir(configDir: string): string {
  return path.join(configDir, 'agents', 'voltz');
}

export async function installPersonas(configDirs: string[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    for (const dir of configDirs) {
      const target = agentsDir(dir);
      await fs.mkdir(target, { recursive: true });
      for (const p of PERSONAS) {
        await fs.writeFile(path.join(target, `${p.id}.md`), p.content, 'utf8');
      }
    }
    return { ok: true, count: PERSONAS.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uninstallPersonas(configDirs: string[]): Promise<void> {
  for (const dir of configDirs) {
    for (const p of PERSONAS) {
      try { await fs.rm(path.join(agentsDir(dir), `${p.id}.md`)); } catch { /* ignore */ }
    }
  }
}

/** Ids das personas instaladas num config dir (para saber se está instalado/atual). */
export async function listInstalledPersonas(configDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(agentsDir(configDir));
    return entries.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

export async function readPersona(configDir: string, id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(agentsDir(configDir), `${id}.md`), 'utf8');
  } catch {
    return null;
  }
}

/** Grava um `.md` editado em todos os config dirs informados. */
export async function writePersona(configDirs: string[], id: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    for (const dir of configDirs) {
      const target = agentsDir(dir);
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, `${id}.md`), body, 'utf8');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export { PERSONAS_VERSION };
