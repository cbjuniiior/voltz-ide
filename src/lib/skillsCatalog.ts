// Curated catalog of Claude Code skills bundled with Voltz IDE.
// Each skill's body is loaded as a raw string from src/assets/skills/<id>.md
// via Vite's ?raw import. When the user installs a skill, the body is written
// verbatim to `<projectPath>/.claude/skills/<id>/SKILL.md`, which Claude Code
// auto-discovers on its next session.

import frontendDesignMd from '@/assets/skills/frontend-design.md?raw';
import brandGuidelinesMd from '@/assets/skills/brand-guidelines.md?raw';
import themeFactoryMd from '@/assets/skills/theme-factory.md?raw';
import webArtifactsBuilderMd from '@/assets/skills/web-artifacts-builder.md?raw';
import webappTestingMd from '@/assets/skills/webapp-testing.md?raw';
import landingConversionBrMd from '@/assets/skills/landing-conversion-br.md?raw';
import codeReviewRigorosoMd from '@/assets/skills/code-review-rigoroso.md?raw';
import testDrivenBugFixMd from '@/assets/skills/test-driven-bug-fix.md?raw';
import refactorIncrementalMd from '@/assets/skills/refactor-incremental.md?raw';
import securityReviewOwaspMd from '@/assets/skills/security-review-owasp.md?raw';
import secretsLeakScanMd from '@/assets/skills/secrets-leak-scan.md?raw';
import copyConversaoPtBrMd from '@/assets/skills/copy-conversao-ptbr.md?raw';
import acessibilidadeWcagMd from '@/assets/skills/acessibilidade-wcag.md?raw';
import dockerfileProducaoMd from '@/assets/skills/dockerfile-producao.md?raw';
import ciGithubActionsMd from '@/assets/skills/ci-github-actions.md?raw';
// Curated from skills.sh (Vercel, Supabase, mattpocock, coreyhaines31) — real SKILL.md content.
import vercelReactBestPracticesMd from '@/assets/skills/vercel-react-best-practices.md?raw';
import webDesignGuidelinesMd from '@/assets/skills/web-design-guidelines.md?raw';
import reactCompositionPatternsMd from '@/assets/skills/react-composition-patterns.md?raw';
import supabasePostgresMd from '@/assets/skills/supabase-postgres-best-practices.md?raw';
import improveArchitectureMd from '@/assets/skills/improve-codebase-architecture.md?raw';
import toPrdMd from '@/assets/skills/to-prd.md?raw';
import grillMeMd from '@/assets/skills/grill-me.md?raw';
import diagnoseBugMd from '@/assets/skills/diagnose-bug.md?raw';
import copywritingMd from '@/assets/skills/copywriting.md?raw';
import contentStrategyMd from '@/assets/skills/content-strategy.md?raw';
import croOptimizationMd from '@/assets/skills/cro-optimization.md?raw';
import aiSeoMd from '@/assets/skills/ai-seo.md?raw';
import adCreativeMd from '@/assets/skills/ad-creative.md?raw';
import customerResearchMd from '@/assets/skills/customer-research.md?raw';

export type SkillCategory = 'design' | 'landing' | 'dev' | 'backend' | 'security' | 'ux' | 'marketing' | 'devops';
export type SkillSource = 'anthropic' | 'voltz';

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: SkillCategory;
  tags: string[];
  /** Exact bytes to write to <projectPath>/.claude/skills/<id>/SKILL.md */
  body: string;
  source: SkillSource;
}

export interface SkillCategoryMeta {
  id: SkillCategory;
  label: string;
  emoji: string;
}

export const SKILL_CATEGORIES: SkillCategoryMeta[] = [
  { id: 'design',    label: 'Design & UI',   emoji: '🎨' },
  { id: 'landing',   label: 'Landing Page',  emoji: '🚀' },
  { id: 'marketing', label: 'Marketing',     emoji: '📈' },
  { id: 'dev',       label: 'Dev',           emoji: '💻' },
  { id: 'backend',   label: 'Backend',       emoji: '🗄️' },
  { id: 'security',  label: 'Segurança',     emoji: '🔒' },
  { id: 'ux',        label: 'UX & Copy',     emoji: '🧪' },
  { id: 'devops',    label: 'DevOps',        emoji: '⚙️' },
];

export const SKILLS: SkillCatalogEntry[] = [
  // ============== DESIGN & UI ==============
  {
    id: 'frontend-design',
    name: 'Frontend Design distintivo',
    description: 'UI moderna, opinativa, sem cara de "AI slop". Componentes/páginas com atitude estética.',
    emoji: '🎨',
    category: 'design',
    tags: ['react', 'css', 'tailwind', 'design-system'],
    body: frontendDesignMd,
    source: 'anthropic',
  },
  {
    id: 'theme-factory',
    name: 'Theme Factory',
    description: 'Gera design tokens (cores, espaçamento, tipografia) consistentes e exportáveis.',
    emoji: '🎯',
    category: 'design',
    tags: ['tokens', 'design-system', 'css'],
    body: themeFactoryMd,
    source: 'anthropic',
  },
  {
    id: 'brand-guidelines',
    name: 'Brand Guidelines',
    description: 'Mantém consistência visual com diretrizes de marca (cores, tipos, vozes).',
    emoji: '🏷️',
    category: 'design',
    tags: ['brand', 'design-system'],
    body: brandGuidelinesMd,
    source: 'anthropic',
  },

  // ============== LANDING PAGE ==============
  {
    id: 'landing-conversion-br',
    name: 'Landing Page de Conversão (BR)',
    description: 'LP focada em conversão para o mercado brasileiro: estrutura, copy, BRL, LGPD.',
    emoji: '🚀',
    category: 'landing',
    tags: ['conversao', 'lp', 'brasil', 'copy'],
    body: landingConversionBrMd,
    source: 'voltz',
  },
  {
    id: 'web-artifacts-builder',
    name: 'Web Artifacts Builder',
    description: 'Constrói páginas/aplicações web completas em HTML/CSS/JS prontas pra rodar.',
    emoji: '🌐',
    category: 'landing',
    tags: ['html', 'css', 'js', 'static'],
    body: webArtifactsBuilderMd,
    source: 'anthropic',
  },

  // ============== DEV ==============
  {
    id: 'code-review-rigoroso',
    name: 'Code Review Rigoroso',
    description: 'Revisão crítica de PR/diff: correctness, segurança, manutenibilidade, convenções.',
    emoji: '🔍',
    category: 'dev',
    tags: ['code-review', 'pr', 'qualidade'],
    body: codeReviewRigorosoMd,
    source: 'voltz',
  },
  {
    id: 'test-driven-bug-fix',
    name: 'Bug Fix com TDD',
    description: 'Corrige bugs com ciclo red→green→refactor e teste de regressão obrigatório.',
    emoji: '🐛',
    category: 'dev',
    tags: ['testes', 'tdd', 'bug-fix'],
    body: testDrivenBugFixMd,
    source: 'voltz',
  },
  {
    id: 'refactor-incremental',
    name: 'Refactor Incremental',
    description: 'Refactor seguro em passos pequenos, sem mudar comportamento, com testes como rede.',
    emoji: '🧹',
    category: 'dev',
    tags: ['refactor', 'qualidade'],
    body: refactorIncrementalMd,
    source: 'voltz',
  },
  {
    id: 'webapp-testing',
    name: 'Testes E2E (Playwright)',
    description: 'Testa fluxos completos de web app com Playwright/Chromium em CI.',
    emoji: '🧪',
    category: 'dev',
    tags: ['playwright', 'e2e', 'testes'],
    body: webappTestingMd,
    source: 'anthropic',
  },

  // ============== SEGURANÇA ==============
  {
    id: 'security-review-owasp',
    name: 'Security Review (OWASP)',
    description: 'Auditoria contra OWASP Top 10 + LGPD + checks de pagamento e upload.',
    emoji: '🛡️',
    category: 'security',
    tags: ['owasp', 'seguranca', 'lgpd'],
    body: securityReviewOwaspMd,
    source: 'voltz',
  },
  {
    id: 'secrets-leak-scan',
    name: 'Scan de Secrets Vazados',
    description: 'Detecta API keys/tokens no histórico do git e orienta rotação + limpeza.',
    emoji: '🔑',
    category: 'security',
    tags: ['secrets', 'gitleaks', 'rotacao'],
    body: secretsLeakScanMd,
    source: 'voltz',
  },

  // ============== UX & COPY ==============
  {
    id: 'copy-conversao-ptbr',
    name: 'Copy de Conversão (PT-BR)',
    description: 'Headlines, CTAs, microcopy e mensagens de erro em PT-BR que converte.',
    emoji: '✍️',
    category: 'ux',
    tags: ['copy', 'cta', 'pt-br', 'ux-writing'],
    body: copyConversaoPtBrMd,
    source: 'voltz',
  },
  {
    id: 'acessibilidade-wcag',
    name: 'Acessibilidade (WCAG AA)',
    description: 'Audita e corrige issues de a11y: teclado, contraste, ARIA, leitores de tela.',
    emoji: '♿',
    category: 'ux',
    tags: ['a11y', 'wcag', 'inclusao'],
    body: acessibilidadeWcagMd,
    source: 'voltz',
  },

  // ============== DEVOPS ==============
  {
    id: 'dockerfile-producao',
    name: 'Dockerfile de Produção',
    description: 'Dockerfile multi-stage, pequeno, seguro, com cache eficiente e healthcheck.',
    emoji: '🐳',
    category: 'devops',
    tags: ['docker', 'container', 'deploy'],
    body: dockerfileProducaoMd,
    source: 'voltz',
  },
  {
    id: 'ci-github-actions',
    name: 'CI com GitHub Actions',
    description: 'Pipeline completa: lint, typecheck, test, build, deploy. Paralelo e com cache.',
    emoji: '🤖',
    category: 'devops',
    tags: ['ci', 'github-actions', 'pipeline'],
    body: ciGithubActionsMd,
    source: 'voltz',
  },

  // ============== Curadas do skills.sh (conteúdo real, open-source) ==============

  // --- React & Design (Vercel) ---
  {
    id: 'vercel-react-best-practices',
    name: 'React Best Practices (Vercel)',
    description: 'Guia de performance React/Next.js da engenharia da Vercel. Usar ao escrever/revisar componentes.',
    emoji: '⚛️',
    category: 'dev',
    tags: ['react', 'nextjs', 'performance', 'vercel'],
    body: vercelReactBestPracticesMd,
    source: 'voltz',
  },
  {
    id: 'react-composition-patterns',
    name: 'Composition Patterns (React)',
    description: 'Padrões de composição de componentes React — quando compor vs prop-drill vs context.',
    emoji: '🧩',
    category: 'dev',
    tags: ['react', 'composição', 'arquitetura'],
    body: reactCompositionPatternsMd,
    source: 'voltz',
  },
  {
    id: 'web-design-guidelines',
    name: 'Web Interface Guidelines',
    description: 'Revisa UI contra as Web Interface Guidelines (acessibilidade, UX, boas práticas). "revise minha UI".',
    emoji: '📐',
    category: 'design',
    tags: ['ui', 'a11y', 'review', 'vercel'],
    body: webDesignGuidelinesMd,
    source: 'voltz',
  },

  // --- Backend (Supabase) ---
  {
    id: 'supabase-postgres-best-practices',
    name: 'Supabase Postgres',
    description: 'Otimização e boas práticas de Postgres da Supabase: queries, schema, RLS, índices.',
    emoji: '🗄️',
    category: 'backend',
    tags: ['supabase', 'postgres', 'rls', 'sql'],
    body: supabasePostgresMd,
    source: 'voltz',
  },

  // --- Dev quality (mattpocock) ---
  {
    id: 'improve-codebase-architecture',
    name: 'Melhorar Arquitetura',
    description: 'Encontra oportunidades de refactor e desacoplamento pra deixar o código mais testável e navegável.',
    emoji: '🏗️',
    category: 'dev',
    tags: ['arquitetura', 'refactor', 'qualidade'],
    body: improveArchitectureMd,
    source: 'voltz',
  },
  {
    id: 'diagnose-bug',
    name: 'Diagnóstico de Bug',
    description: 'Loop disciplinado: reproduzir → minimizar → hipótese → instrumentar → corrigir → teste de regressão.',
    emoji: '🔬',
    category: 'dev',
    tags: ['debug', 'bug', 'performance'],
    body: diagnoseBugMd,
    source: 'voltz',
  },
  {
    id: 'grill-me',
    name: 'Grill Me (stress-test de plano)',
    description: 'O Claude te entrevista sem dó sobre um plano/design até bater o martelo em cada decisão.',
    emoji: '🔥',
    category: 'dev',
    tags: ['planejamento', 'design', 'crítica'],
    body: grillMeMd,
    source: 'voltz',
  },
  {
    id: 'to-prd',
    name: 'Gerar PRD',
    description: 'Transforma a conversa atual num PRD estruturado e publica no issue tracker do projeto.',
    emoji: '📋',
    category: 'dev',
    tags: ['prd', 'specs', 'planejamento'],
    body: toPrdMd,
    source: 'voltz',
  },

  // --- Marketing & Growth (coreyhaines31) ---
  {
    id: 'copywriting',
    name: 'Copywriting (conversão)',
    description: 'Escreve/melhora copy de páginas: hero, headline, CTA, value prop, pricing. Persuasão que converte.',
    emoji: '✍️',
    category: 'marketing',
    tags: ['copy', 'landing', 'conversão'],
    body: copywritingMd,
    source: 'voltz',
  },
  {
    id: 'cro-optimization',
    name: 'CRO — Otimização de Conversão',
    description: 'Diagnostica e melhora conversão de páginas e formulários. "essa página não converte".',
    emoji: '📊',
    category: 'marketing',
    tags: ['cro', 'conversão', 'landing'],
    body: croOptimizationMd,
    source: 'voltz',
  },
  {
    id: 'ai-seo',
    name: 'AI SEO (AEO/GEO)',
    description: 'Otimiza conteúdo pra aparecer em respostas de IA (ChatGPT, Perplexity, AI Overviews) e ser citado.',
    emoji: '🔎',
    category: 'marketing',
    tags: ['seo', 'aeo', 'geo', 'ia'],
    body: aiSeoMd,
    source: 'voltz',
  },
  {
    id: 'content-strategy',
    name: 'Estratégia de Conteúdo',
    description: 'Planeja o que produzir: pilares, topic clusters, calendário editorial, ideias de conteúdo.',
    emoji: '🗂️',
    category: 'marketing',
    tags: ['conteúdo', 'estratégia', 'blog'],
    body: contentStrategyMd,
    source: 'voltz',
  },
  {
    id: 'ad-creative',
    name: 'Ad Creative (anúncios)',
    description: 'Gera e itera criativos de anúncio em escala: headlines, descrições, variações pra Meta/Google/LinkedIn.',
    emoji: '📣',
    category: 'marketing',
    tags: ['ads', 'criativo', 'paid'],
    body: adCreativeMd,
    source: 'voltz',
  },
  {
    id: 'customer-research',
    name: 'Customer Research (ICP/VOC)',
    description: 'Conduz e analisa pesquisa de cliente: personas, JTBD, mineração de reviews/Reddit, voz do cliente.',
    emoji: '🔬',
    category: 'marketing',
    tags: ['pesquisa', 'icp', 'persona', 'voc'],
    body: customerResearchMd,
    source: 'voltz',
  },
];

export function findSkill(id: string): SkillCatalogEntry | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

export function skillsByCategory(category: SkillCategory): SkillCatalogEntry[] {
  return SKILLS.filter((s) => s.category === category);
}
