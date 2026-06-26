import { create } from 'zustand';

export interface Snippet {
  id: string;
  title: string;
  body: string;
}

interface SnippetsStore {
  snippets: Snippet[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (title: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Snippet>) => Promise<void>;
}

function newId(): string {
  return 'snip_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// Snippets úteis semeados por versão. Viram texto no terminal ativo ao clicar —
// não executam sozinhos. `v` = versão em que o snippet foi introduzido (para
// acrescentar novos sem duplicar nem reintroduzir os que o usuário apagou).
const SEED_VERSION = 2;
const DEFAULT_SNIPPETS: { title: string; body: string; v: number }[] = [
  // v1 — git & dev
  { title: 'Git · status curto', body: 'git status -sb', v: 1 },
  { title: 'Git · log recente', body: 'git log --oneline --graph -15', v: 1 },
  { title: 'Git · add + commit', body: 'git add -A && git commit -m "feat: "', v: 1 },
  { title: 'Git · nova branch', body: 'git checkout -b feat/', v: 1 },
  { title: 'Git · push (upstream)', body: 'git push -u origin HEAD', v: 1 },
  { title: 'Git · desfazer último commit (mantém arquivos)', body: 'git reset --soft HEAD~1', v: 1 },
  { title: 'Git · descartar mudanças locais', body: 'git restore .', v: 1 },
  { title: 'Git · stash com nome', body: 'git stash push -m "wip"', v: 1 },
  { title: 'Dev · instalar deps', body: 'npm install', v: 1 },
  { title: 'Dev · rodar dev', body: 'npm run dev', v: 1 },
  { title: 'Dev · build', body: 'npm run build', v: 1 },
  { title: 'Dev · matar porta', body: 'npx kill-port 5173', v: 1 },
  { title: 'IA · revisar mudanças', body: 'Revise as mudanças do meu git diff e aponte bugs, riscos de segurança e melhorias — em ordem de prioridade.', v: 1 },
  { title: 'IA · escrever testes', body: 'Escreva testes cobrindo os casos principais e de borda do que acabei de alterar.', v: 1 },
  { title: 'IA · explicar projeto', body: 'Explique a arquitetura deste projeto: principais módulos, fluxo de dados e pontos de entrada.', v: 1 },
  { title: 'IA · commit convencional', body: 'Gere a mensagem de commit no padrão Conventional Commits (em pt-BR) para as mudanças staged e faça o commit.', v: 1 },
  { title: 'IA · atualizar contexto', body: 'Atualize o CLAUDE.md e o AGENTS.md com o estado atual do projeto e os próximos passos.', v: 1 },
  // v2 — visual, bugs, UI/UX e qualidade
  { title: 'IA · auditar UI/UX', body: 'Faça uma auditoria de UI/UX desta tela: hierarquia visual, contraste, espaçamento, consistência e fluxo. Liste os problemas por severidade com a correção sugerida para cada um.', v: 2 },
  { title: 'IA · melhorar o visual', body: 'Melhore o visual deste componente mantendo a identidade do produto: tipografia, escala, espaçamento, cor e profundidade. Implemente e explique o porquê de cada ajuste.', v: 2 },
  { title: 'IA · responsividade', body: 'Revise a responsividade desta tela em mobile, tablet e desktop. Aponte quebras de layout, overflow, alvos de toque pequenos e textos cortados — com as correções.', v: 2 },
  { title: 'IA · acessibilidade (a11y)', body: 'Verifique a acessibilidade: contraste AA, navegação por teclado, foco visível, labels/aria e leitura por leitor de tela. Liste as falhas e corrija.', v: 2 },
  { title: 'IA · caçar bugs', body: 'Analise este código em busca de bugs: casos de borda, null/undefined, condições de corrida, vazamentos de memória e erros não tratados. Liste por impacto e probabilidade.', v: 2 },
  { title: 'IA · revisão de segurança', body: 'Revise riscos de segurança: injeção, XSS, validação de entrada, segredos expostos, autenticação e permissões. Aponte cada risco e a correção.', v: 2 },
  { title: 'IA · explicar erro', body: 'Explique a causa-raiz deste erro/stacktrace e proponha a correção mínima e segura, sem efeitos colaterais.', v: 2 },
  { title: 'IA · refatorar com segurança', body: 'Refatore este trecho para ficar mais legível e robusto, sem mudar o comportamento. Explique cada mudança e o ganho.', v: 2 },
  { title: 'IA · performance', body: 'Analise gargalos de performance (renders desnecessários, re-fetch, loops, tamanho de bundle) e proponha otimizações priorizadas pelo ganho real.', v: 2 },
];

export const useSnippetsStore = create<SnippetsStore>((set, get) => ({
  snippets: [],
  loaded: false,
  async load() {
    const stored = await window.api.store.get<Snippet[]>('snippets');
    const seededLegacy = await window.api.store.get<boolean>('snippetsSeeded');
    const storedVersion = (await window.api.store.get<number>('snippetsSeedVersion')) ?? (seededLegacy ? 1 : 0);
    // Acrescenta os snippets padrão das versões novas, sem duplicar título nem
    // reintroduzir os que o usuário apagou de versões antigas.
    if (storedVersion < SEED_VERSION) {
      const existing = stored ?? [];
      const titles = new Set(existing.map((s) => s.title));
      const additions: Snippet[] = DEFAULT_SNIPPETS
        .filter((d) => d.v > storedVersion && !titles.has(d.title))
        .map((d) => ({ id: newId(), title: d.title, body: d.body }));
      const merged = [...existing, ...additions];
      set({ snippets: merged, loaded: true });
      await window.api.store.set('snippets', merged);
      await window.api.store.set('snippetsSeedVersion', SEED_VERSION);
      await window.api.store.set('snippetsSeeded', true);
      return;
    }
    set({ snippets: stored ?? [], loaded: true });
  },
  async add(title, body) {
    const s: Snippet = { id: newId(), title: title.trim() || 'Snippet', body };
    const next = [...get().snippets, s];
    set({ snippets: next });
    await window.api.store.set('snippets', next);
  },
  async remove(id) {
    const next = get().snippets.filter((s) => s.id !== id);
    set({ snippets: next });
    await window.api.store.set('snippets', next);
  },
  async update(id, patch) {
    const next = get().snippets.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ snippets: next });
    await window.api.store.set('snippets', next);
  },
}));
