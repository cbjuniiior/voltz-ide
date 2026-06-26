// Catálogo de skills GLOBAIS (por conta): instaladas em <CLAUDE_CONFIG_DIR>/skills/
// de cada conta, funcionando em qualquer projeto. As do tipo 'copy' são baixadas
// do GitHub e materializadas como arquivos; as do tipo 'plugin' precisam de um
// runtime/CLI/MCP e por isso só mostramos o comando oficial de instalação.

import type { GlobalInstallSpec } from '@shared/types';

export interface GlobalSkillEntry {
  id: string;
  name: string;
  emoji: string;
  description: string;
  repoUrl: string;
  license: string;
  /** 'copy' = o app instala copiando arquivos; 'plugin' = precisa de terminal. */
  kind: 'copy' | 'plugin';
  /** Para kind 'copy'. */
  spec?: GlobalInstallSpec;
  /** Quando true, instala um conjunto de skills (ids resolvidos do repo). */
  multi?: boolean;
  /** Para kind 'plugin': como instalar via terminal. */
  install?: { note: string; command?: string };
}

export interface GlobalSkillGroup {
  id: string;
  label: string;
  emoji: string;
  blurb: string;
  skills: GlobalSkillEntry[];
}

// ---- Skills "design" derivadas do awesome-design-md (DESIGN.md por marca) ----
// pasta real no repo → { id limpo, label, emoji }
const DESIGN_BRANDS: Array<{ folder: string; id: string; label: string; emoji: string }> = [
  { folder: 'stripe', id: 'design-stripe', label: 'Stripe', emoji: '💳' },
  { folder: 'linear.app', id: 'design-linear', label: 'Linear', emoji: '📐' },
  { folder: 'notion', id: 'design-notion', label: 'Notion', emoji: '📝' },
  { folder: 'figma', id: 'design-figma', label: 'Figma', emoji: '🎨' },
  { folder: 'supabase', id: 'design-supabase', label: 'Supabase', emoji: '🟢' },
  { folder: 'vercel', id: 'design-vercel', label: 'Vercel', emoji: '▲' },
  { folder: 'apple', id: 'design-apple', label: 'Apple', emoji: '🍎' },
  { folder: 'spotify', id: 'design-spotify', label: 'Spotify', emoji: '🎧' },
  { folder: 'cursor', id: 'design-cursor', label: 'Cursor', emoji: '🖱️' },
  { folder: 'framer', id: 'design-framer', label: 'Framer', emoji: '🪄' },
];

const designSkills: GlobalSkillEntry[] = DESIGN_BRANDS.map((b) => ({
  id: b.id,
  name: `Design: ${b.label}`,
  emoji: b.emoji,
  description: `Sistema de design da ${b.label} (cores, tipografia, espaçamento, componentes) pra gerar UI no mesmo estilo visual.`,
  repoUrl: 'https://github.com/VoltAgent/awesome-design-md',
  license: 'MIT',
  kind: 'copy',
  spec: {
    mode: 'design-file',
    id: b.id,
    label: b.label,
    owner: 'VoltAgent',
    repo: 'awesome-design-md',
    branch: 'main',
    path: `design-md/${b.folder}/DESIGN.md`,
  },
}));

export const GLOBAL_SKILL_GROUPS: GlobalSkillGroup[] = [
  {
    id: 'workflow',
    label: 'Workflow & Qualidade',
    emoji: '🧠',
    blurb: 'Metodologia de trabalho do agente — TDD, debugging, planos, code review.',
    skills: [
      {
        id: 'superpowers',
        name: 'Superpowers (obra)',
        emoji: '🦾',
        description: '14 skills de engenharia: TDD, debugging sistemático, planejamento, worktrees, code review, brainstorming.',
        repoUrl: 'https://github.com/obra/superpowers',
        license: 'MIT',
        kind: 'copy',
        multi: true,
        spec: { mode: 'folder-of-skills', owner: 'obra', repo: 'superpowers', branch: 'main', path: 'skills' },
      },
      {
        id: 'caveman',
        name: 'Caveman Mode',
        emoji: '🪨',
        description: 'Modo de comunicação ultra-comprimido: corta ~75% dos tokens mantendo a precisão técnica.',
        repoUrl: 'https://github.com/JuliusBrussee/caveman',
        license: 'MIT',
        kind: 'copy',
        spec: { mode: 'folder', id: 'caveman', owner: 'JuliusBrussee', repo: 'caveman', branch: 'main', path: 'skills/caveman' },
      },
    ],
  },
  {
    id: 'ui',
    label: 'UI & Design',
    emoji: '✨',
    blurb: 'Polimento de interface e estilos visuais de marcas conhecidas.',
    skills: [
      {
        id: 'make-interfaces-feel-better',
        name: 'Make Interfaces Feel Better',
        emoji: '🪄',
        description: 'Princípios de design engineering: animações, border radius concêntrico, alinhamento óptico, tipografia, micro-interações.',
        repoUrl: 'https://github.com/jakubkrehel/make-interfaces-feel-better',
        license: 'MIT',
        kind: 'copy',
        spec: {
          mode: 'folder', id: 'make-interfaces-feel-better',
          owner: 'jakubkrehel', repo: 'make-interfaces-feel-better', branch: 'main',
          path: 'skills/make-interfaces-feel-better',
        },
      },
      ...designSkills,
    ],
  },
  {
    id: 'plugins',
    label: 'Plugins & MCP (via terminal)',
    emoji: '🔌',
    blurb: 'Precisam de runtime (Node/Python/MCP). Não dá pra instalar só copiando — rode o comando oficial no terminal da conta.',
    skills: [
      {
        id: 'impeccable',
        name: 'Impeccable',
        emoji: '🎯',
        description: 'Design fluency pro agente: 23 comandos, iteração ao vivo no browser e 41 regras detectoras de anti-pattern.',
        repoUrl: 'https://github.com/pbakaus/impeccable',
        license: 'Apache-2.0',
        kind: 'plugin',
        install: { note: 'Rode na raiz do projeto (instala scripts + CLI):', command: 'npx impeccable install' },
      },
      {
        id: 'browser-harness',
        name: 'Browser Harness',
        emoji: '🌐',
        description: 'Controle direto do Chrome via CDP (cliques por coordenada, screenshots). Requer CLI Python + uv + Chrome.',
        repoUrl: 'https://github.com/browser-use/browser-harness',
        license: 'MIT',
        kind: 'plugin',
        install: { note: 'Clone e instale o CLI (precisa de uv):', command: 'git clone https://github.com/browser-use/browser-harness && cd browser-harness && uv tool install -e .' },
      },
      {
        id: 'claude-mem',
        name: 'Claude-mem',
        emoji: '🧩',
        description: 'Memória persistente entre sessões (MCP + hooks + worker SQLite). Instala como pacote npm.',
        repoUrl: 'https://github.com/thedotmack/claude-mem',
        license: 'Apache-2.0',
        kind: 'plugin',
        install: { note: 'Instala plugin + MCP + hooks:', command: 'npx claude-mem install' },
      },
      {
        id: 'context-mode',
        name: 'Context Mode',
        emoji: '🗜️',
        description: 'Reduz ~98% do uso de contexto rodando comandos em sandbox + base FTS5. Plugin + MCP (Node ≥22.5).',
        repoUrl: 'https://github.com/mksglu/context-mode',
        license: 'Elastic-2.0',
        kind: 'plugin',
        install: { note: 'No Claude Code, adicione o marketplace de plugins:', command: '/plugin marketplace add mksglu/context-mode' },
      },
    ],
  },
];

export const ALL_GLOBAL_SKILLS: GlobalSkillEntry[] =
  GLOBAL_SKILL_GROUPS.flatMap((g) => g.skills);
