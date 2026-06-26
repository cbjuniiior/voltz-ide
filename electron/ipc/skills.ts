import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchFolder, fetchRawFile, fetchFolderOfSkills, type RemoteFile } from '../services/skillsRemote';
import type { GlobalInstallSpec } from '../../shared/types';

// Por projeto: .claude/skills/<id>/SKILL.md — layout que o Claude Code
// auto-descobre dentro de cada projeto.
const SKILLS_SUBDIR = '.claude/skills';
// Global (por conta): <CLAUDE_CONFIG_DIR>/skills/<id>/SKILL.md — o config dir
// já é o "~/.claude" daquela conta, então a skill vale em qualquer projeto.
const GLOBAL_SKILLS_SUBDIR = 'skills';

function sanitiseSkillId(id: string): string | null {
  // Permite letras ASCII minúsculas, dígitos e hífens. Rejeita qualquer coisa
  // que possa escapar da pasta de skills (.., /, \, ...).
  if (!id || typeof id !== 'string') return null;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) return null;
  return id;
}

/** Normaliza um caminho relativo, rejeitando traversal/absolutos. */
function safeRelPath(rel: string): string | null {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm) return null;
  if (path.isAbsolute(norm)) return null;
  if (norm.split('/').some((seg) => seg === '..')) return null;
  return norm;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Lista os ids de skills (subpastas com SKILL.md) sob `skillsRoot`. */
async function listSkillIdsIn(skillsRoot: string): Promise<string[]> {
  if (!await isDirectory(skillsRoot)) return [];
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  const installed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsRoot, entry.name, 'SKILL.md');
    try {
      const stat = await fs.stat(skillFile);
      if (stat.isFile()) installed.push(entry.name);
    } catch { /* skip dirs without SKILL.md */ }
  }
  return installed;
}

/** Escreve uma skill multi-arquivo em <configDir>/skills/<id>/, substituindo a anterior. */
async function writeSkillTree(configDir: string, skillId: string, files: RemoteFile[]): Promise<void> {
  const safeId = sanitiseSkillId(skillId);
  if (!safeId) throw new Error(`ID de skill inválido: ${skillId}`);
  if (!files.length) throw new Error('Skill sem arquivos.');
  const root = path.join(configDir, GLOBAL_SKILLS_SUBDIR, safeId);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  for (const f of files) {
    const safe = safeRelPath(f.relPath);
    if (!safe) continue;
    const dest = path.join(root, safe);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.content, 'utf8');
  }
}

/**
 * Converte um DESIGN.md (awesome-design-md) numa skill válida: força o `name`
 * para um id lowercase-hífen e dá à description um gatilho de uso.
 */
function normaliseDesignSkill(raw: string, id: string, label: string): string {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const trigger = `Use ao gerar, redesenhar ou estilizar uma UI no estilo visual de ${label} (cores, tipografia, espaçamento, componentes).`;
  if (!m) {
    return `---\nname: ${id}\ndescription: ${JSON.stringify(trigger)}\n---\n\n${raw}`;
  }
  const fm = m[1];
  const body = m[2];
  const descMatch = fm.match(/description:\s*([\s\S]*?)\s*$/);
  const origDesc = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';
  const desc = `${trigger} ${origDesc}`.slice(0, 1000).trim();
  return `---\nname: ${id}\ndescription: ${JSON.stringify(desc)}\n---\n${body}`;
}

async function resolveSpecFiles(spec: GlobalInstallSpec): Promise<Array<{ id: string; files: RemoteFile[] }>> {
  switch (spec.mode) {
    case 'folder': {
      const files = await fetchFolder(spec.owner, spec.repo, spec.branch, spec.path, { mdOnly: spec.mdOnly });
      return [{ id: spec.id, files }];
    }
    case 'design-file': {
      const raw = await fetchRawFile(spec.owner, spec.repo, spec.branch, spec.path);
      const content = normaliseDesignSkill(raw, spec.id, spec.label);
      return [{ id: spec.id, files: [{ relPath: 'SKILL.md', content }] }];
    }
    case 'folder-of-skills': {
      const all = await fetchFolderOfSkills(spec.owner, spec.repo, spec.branch, spec.path);
      return all.filter((s) => sanitiseSkillId(s.id) && (!spec.only?.length || spec.only.includes(s.id)));
    }
  }
}

export function registerSkillsIpc() {
  // ===== Skills por projeto (.claude/skills) =====
  ipcMain.handle('skills:install',
    async (_evt, projectPath: string, skillId: string, body: string) => {
      try {
        if (!await isDirectory(projectPath)) {
          return { ok: false, error: 'Caminho do projeto não existe.' };
        }
        const safeId = sanitiseSkillId(skillId);
        if (!safeId) return { ok: false, error: `ID de skill inválido: ${skillId}` };
        if (typeof body !== 'string' || body.length === 0) {
          return { ok: false, error: 'Conteúdo da skill vazio.' };
        }

        const skillDir = path.join(projectPath, SKILLS_SUBDIR, safeId);
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), body, 'utf8');
        return { ok: true as const };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    });

  ipcMain.handle('skills:listInstalled', async (_evt, projectPath: string) => {
    try {
      if (!await isDirectory(projectPath)) return [];
      return await listSkillIdsIn(path.join(projectPath, SKILLS_SUBDIR));
    } catch {
      return [];
    }
  });

  ipcMain.handle('skills:uninstall', async (_evt, projectPath: string, skillId: string) => {
    try {
      if (!await isDirectory(projectPath)) {
        return { ok: false, error: 'Caminho do projeto não existe.' };
      }
      const safeId = sanitiseSkillId(skillId);
      if (!safeId) return { ok: false, error: `ID de skill inválido: ${skillId}` };

      const skillDir = path.join(projectPath, SKILLS_SUBDIR, safeId);
      if (!await isDirectory(skillDir)) return { ok: true as const };
      await fs.rm(skillDir, { recursive: true, force: true });
      return { ok: true as const };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // ===== Skills globais (por conta — <CLAUDE_CONFIG_DIR>/skills) =====

  /** Lista os ids de skills globais instaladas num config dir de conta. */
  ipcMain.handle('skills:listGlobal', async (_evt, configDir: string) => {
    try {
      if (!configDir || !await isDirectory(configDir)) return [];
      return await listSkillIdsIn(path.join(configDir, GLOBAL_SKILLS_SUBDIR));
    } catch {
      return [];
    }
  });

  /**
   * Baixa uma skill do GitHub e instala em TODOS os config dirs informados
   * (uma conta cada). Contas novas herdam de ~/.claude via createAccountDir.
   */
  ipcMain.handle('skills:installGlobalFromRepo', async (_evt, spec: GlobalInstallSpec, dirs: string[]) => {
    try {
      const targets = (dirs ?? []).filter(Boolean);
      if (!targets.length) return { ok: false as const, error: 'Nenhuma conta para instalar.' };
      const resolved = await resolveSpecFiles(spec);
      if (!resolved.length) return { ok: false as const, error: 'Nenhuma skill encontrada no repositório.' };

      const installedIds: string[] = [];
      for (const dir of targets) {
        await fs.mkdir(path.join(dir, GLOBAL_SKILLS_SUBDIR), { recursive: true });
        for (const { id, files } of resolved) {
          await writeSkillTree(dir, id, files);
        }
      }
      for (const { id } of resolved) installedIds.push(id);
      return { ok: true as const, installedIds, accounts: targets.length };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  /** Remove uma skill global de todos os config dirs informados. */
  ipcMain.handle('skills:uninstallGlobal', async (_evt, skillIds: string[], dirs: string[]) => {
    try {
      const ids = (skillIds ?? []).map(sanitiseSkillId).filter((x): x is string => !!x);
      const targets = (dirs ?? []).filter(Boolean);
      for (const dir of targets) {
        for (const id of ids) {
          await fs.rm(path.join(dir, GLOBAL_SKILLS_SUBDIR, id), { recursive: true, force: true });
        }
      }
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}
