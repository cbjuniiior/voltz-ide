/**
 * Catálogo das personas do Esquadrão Voltz (metadados do lado da UI).
 * Os ids batem com os subagentes de `electron/services/personaAssets.ts`
 * (`claude --agent <id>`). Cores/emoji são usados no painel e no Canvas.
 */

export interface PersonaMeta {
  /** = nome do subagente. Ex.: 'voltz-maestro'. */
  id: string;
  /** Nome curto exibido. */
  name: string;
  emoji: string;
  /** Cor (hex) da persona na UI/canvas. */
  color: string;
  model: 'opus' | 'sonnet' | 'haiku';
  /** Papel resumido. */
  role: string;
  /** Uma linha do que faz. */
  description: string;
}

export const MAESTRO_ID = 'voltz-maestro';

export const PERSONAS: PersonaMeta[] = [
  { id: 'voltz-maestro', name: 'Maestro', emoji: '🎼', color: '#a855f7', model: 'opus', role: 'Orquestrador', description: 'Planeja, decompõe, delega ao time e integra. Gate de qualidade.' },
  { id: 'voltz-arquiteto', name: 'Arquiteto', emoji: '🏛️', color: '#3b82f6', model: 'opus', role: 'Arquitetura', description: 'Design de sistema, APIs, modelo de dados, extensibilidade.' },
  { id: 'voltz-backend', name: 'Backend', emoji: '⚙️', color: '#06b6d4', model: 'sonnet', role: 'Servidor', description: 'Lógica de servidor, APIs, integrações e dados (adapta à stack).' },
  { id: 'voltz-frontend', name: 'Frontend', emoji: '🎨', color: '#22c55e', model: 'sonnet', role: 'Interface', description: 'UI, componentes, estado e interações (adapta ao framework).' },
  { id: 'voltz-designer', name: 'Designer', emoji: '✨', color: '#ec4899', model: 'sonnet', role: 'UX/UI · Direção criativa', description: 'Design system, A11y e crítica visual (vê a página pelo navegador).' },
  { id: 'voltz-performance', name: 'Performance', emoji: '⚡', color: '#eab308', model: 'sonnet', role: 'Performance', description: 'Profiling e otimização (bundle, queries, Core Web Vitals).' },
  { id: 'voltz-seguranca', name: 'Segurança', emoji: '🛡️', color: '#ef4444', model: 'opus', role: 'Auditoria', description: 'Auditoria adversarial: auth, segredos, injeção, superfícies.' },
  { id: 'voltz-revisor', name: 'Revisor', emoji: '✅', color: '#f97316', model: 'sonnet', role: 'QA / Testes', description: 'Revisão de código + testes. O portão do "verificado".' },
  { id: 'voltz-coringa', name: 'Coringa', emoji: '😈', color: '#e11d48', model: 'opus', role: 'Red-team', description: 'Advogado do diabo: pré-mortem, caça suposição/risco/lógica furada.' },
];

export function personaById(id: string): PersonaMeta | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** Comando que roda uma persona como sessão principal num terminal. */
export function personaCommand(id: string, appendSystemPrompt?: string): string {
  const base = `claude --agent ${id}`;
  if (!appendSystemPrompt) return base;
  // aspas simples escapadas para o shell
  const esc = appendSystemPrompt.replace(/'/g, `'\\''`);
  return `${base} --append-system-prompt '${esc}'`;
}
