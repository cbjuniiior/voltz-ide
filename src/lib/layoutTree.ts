import type { PaneLeaf, PaneNode, PaneSplit } from '@shared/types';

export function newId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyLeaf(): PaneLeaf {
  return {
    kind: 'pane',
    id: newId('pane'),
    terminalId: null,
    projectPath: null,
    projectName: null,
    title: 'Novo terminal',
  };
}

export function findLeaf(node: PaneNode, leafId: string): PaneLeaf | null {
  if (node.kind === 'pane') return node.id === leafId ? node : null;
  for (const child of node.children) {
    const r = findLeaf(child, leafId);
    if (r) return r;
  }
  return null;
}

export function mapNode(node: PaneNode, fn: (n: PaneNode) => PaneNode): PaneNode {
  const replaced = fn(node);
  if (replaced.kind === 'split') {
    return { ...replaced, children: replaced.children.map((c) => mapNode(c, fn)) };
  }
  return replaced;
}

export function updateLeaf(root: PaneNode, leafId: string, patch: Partial<PaneLeaf>): PaneNode {
  return mapNode(root, (n) => {
    if (n.kind === 'pane' && n.id === leafId) {
      return { ...n, ...patch };
    }
    return n;
  });
}

export type SplitPosition = 'before' | 'after';

export function splitLeaf(
  root: PaneNode,
  leafId: string,
  orientation: 'horizontal' | 'vertical',
  position: SplitPosition = 'after',
  newLeaf: PaneLeaf = emptyLeaf(),
): PaneNode {
  function recurse(n: PaneNode): PaneNode {
    if (n.kind === 'pane') {
      if (n.id !== leafId) return n;
      const split: PaneSplit = {
        kind: 'split',
        id: newId('split'),
        orientation,
        sizes: [50, 50],
        children: position === 'before' ? [newLeaf, n] : [n, newLeaf],
      };
      return split;
    }
    return { ...n, children: n.children.map(recurse) };
  }
  return recurse(root);
}

export function closeLeaf(root: PaneNode, leafId: string): PaneNode | null {
  if (root.kind === 'pane') {
    return root.id === leafId ? null : root;
  }
  const newChildren: PaneNode[] = [];
  for (const child of root.children) {
    const result = closeLeaf(child, leafId);
    if (result !== null) newChildren.push(result);
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  const remaining = newChildren.length;
  const equalSize = +(100 / remaining).toFixed(2);
  return { ...root, children: newChildren, sizes: newChildren.map(() => equalSize) };
}

export function setSplitSizes(root: PaneNode, splitId: string, sizes: number[]): PaneNode {
  return mapNode(root, (n) => (n.kind === 'split' && n.id === splitId ? { ...n, sizes } : n));
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.kind === 'pane') return [node];
  return node.children.flatMap(collectLeaves);
}

/** Anexa um novo leaf à árvore (usado no modo canvas, onde a posição é livre). */
export function addLeaf(root: PaneNode, leaf: PaneLeaf): PaneNode {
  if (root.kind === 'pane') {
    return {
      kind: 'split',
      id: newId('split'),
      orientation: 'vertical',
      sizes: [50, 50],
      children: [root, leaf],
    };
  }
  const children = [...root.children, leaf];
  const equal = +(100 / children.length).toFixed(2);
  return { ...root, children, sizes: children.map(() => equal) };
}

/**
 * Troca a posição de dois painéis na árvore preservando seus ids — o React
 * reconcilia por key e MOVE os componentes, mantendo o estado do terminal/
 * webview intacto (sem remontar). Usado pelo drag-and-drop de reordenação.
 */
export function swapLeaves(root: PaneNode, idA: string, idB: string): PaneNode {
  if (idA === idB) return root;
  const a = findLeaf(root, idA);
  const b = findLeaf(root, idB);
  if (!a || !b) return root;
  return mapNode(root, (n) => {
    if (n.kind === 'pane' && n.id === idA) return b;
    if (n.kind === 'pane' && n.id === idB) return a;
    return n;
  });
}
