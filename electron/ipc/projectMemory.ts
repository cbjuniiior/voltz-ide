// "Memória de projeto" para agentes de IA: garante um CLAUDE.md (lido nativamente
// pelo Claude Code) e um AGENTS.md (padrão que o Codex e outros agentes leem) em
// cada projeto. Esses arquivos entram no contexto UMA vez por sessão (custo fixo
// pequeno) e trazem uma REGRA que faz o próprio agente mantê-los atualizados ao
// concluir tarefas — sem o app gastar tokens rodando o agente de novo.
import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function template(name: string): string {
  return `# ${name}

> Memória deste projeto para agentes de IA (Claude Code · Codex). É carregado
> automaticamente no início de cada sessão — mantenha **conciso** (visão de
> relance, não um diário).
>
> **REGRA — auto-contexto:** ao concluir uma mudança significativa, ANTES de
> encerrar, atualize as seções **Estado atual** e **Próximos passos** abaixo
> (1–2 linhas cada) com o que mudou e o que falta. Não reescreva o histórico
> inteiro. Mantenha CLAUDE.md e AGENTS.md com o mesmo conteúdo.

## Visão geral
_Para que serve este projeto, em 1–2 frases._

## Stack & estrutura
_Tecnologias e as pastas/arquivos principais._

## Estado atual
_O que já está pronto e o que está em andamento._

## Decisões
_Escolhas importantes e o porquê (evita rediscutir)._

## Próximos passos
_O que falta fazer._
`;
}

export function registerProjectMemoryIpc() {
  // Cria CLAUDE.md e AGENTS.md se ainda não existirem. Nunca sobrescreve.
  ipcMain.handle('projectMemory:ensure', async (_e, projectPath: string, projectName: string): Promise<{ created: string[] }> => {
    const created: string[] = [];
    if (!projectPath) return { created };
    let isDir = false;
    try { isDir = (await fs.stat(projectPath)).isDirectory(); } catch { /* ignore */ }
    if (!isDir) return { created };
    const content = template(projectName || path.basename(projectPath));
    for (const fname of ['CLAUDE.md', 'AGENTS.md']) {
      const fp = path.join(projectPath, fname);
      try {
        await fs.access(fp); // já existe → não toca
      } catch {
        try { await fs.writeFile(fp, content, 'utf8'); created.push(fname); } catch { /* ignore */ }
      }
    }
    return { created };
  });
}
