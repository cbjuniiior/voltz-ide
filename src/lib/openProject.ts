import { useWorkspaceStore } from '@/stores/workspace';

/** Estamos rodando dentro da janela flutuante (PiP) de Tarefas? */
export function isPipWindow(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('pip=tasks');
}

/**
 * Abre o projeto vinculado a uma tarefa. Na janela principal, cria uma aba
 * direto; na janela flutuante, pede à janela principal para abrir (e focar).
 */
export function openProjectFromTask(name: string, path: string) {
  if (isPipWindow()) {
    void window.api.pip.openProjectInMain(name, path);
  } else {
    useWorkspaceStore.getState().openProjectInNewTab(name, path);
  }
}
