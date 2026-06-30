import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

/** Arquivo de config do Claude para a conta: principal = ~/.claude.json;
 *  secundária = <configDir>/.claude.json (espelha como o claude resolve o env). */
function configFile(envConfigDir?: string): string {
  return envConfigDir ? path.join(envConfigDir, '.claude.json') : path.join(os.homedir(), '.claude.json');
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * Marca o projeto como confiável (`hasTrustDialogAccepted: true`) no `.claude.json`
 * da conta indicada. Sem isso, ao rodar o Claude numa conta que nunca "confiou"
 * a pasta, ele ignora as permissões do `.claude/settings.json` e mostra o aviso
 * "this workspace has not been trusted". `envConfigDir` vazio = conta principal.
 *
 * Idempotente e seguro: lê → ajusta só o campo → reescreve; se já está confiável,
 * não reescreve (evita corrida com o próprio claude).
 */
export async function ensureProjectTrusted(projectPath: string, envConfigDir?: string): Promise<void> {
  if (!projectPath) return;
  const file = configFile(envConfigDir);
  let json: { projects?: Record<string, Record<string, unknown>> };
  try {
    json = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return; // sem config ainda → o claude cria e pergunta na 1ª vez; nada a fazer aqui
  }
  if (!json.projects || typeof json.projects !== 'object') json.projects = {};

  const target = norm(projectPath);
  let key = Object.keys(json.projects).find((k) => norm(k) === target);
  if (!key) {
    key = projectPath.replace(/\\/g, '/'); // o claude grava as chaves com barras normais
    json.projects[key] = {};
  }
  if (json.projects[key].hasTrustDialogAccepted === true) return; // já confiável

  json.projects[key].hasTrustDialogAccepted = true;
  try {
    await fs.writeFile(file, JSON.stringify(json, null, 2));
  } catch { /* ignore */ }
}
