import { appStore } from '../appStore';
import type { RemoteActivity } from '../../../shared/types';

// Histórico persistente do controle remoto (sobrevive a reinícios do app).
// Guardado em ordem cronológica (mais antigo primeiro); a UI inverte p/ exibir.
const KEY = 'remoteHistory';
const CAP = 800;

export function getRemoteHistory(): RemoteActivity[] {
  const raw = appStore.get(KEY);
  return Array.isArray(raw) ? (raw as RemoteActivity[]) : [];
}

export function appendRemoteHistory(e: RemoteActivity): void {
  const list = getRemoteHistory();
  list.push(e);
  if (list.length > CAP) list.splice(0, list.length - CAP);
  appStore.set(KEY, list);
}

/** Limpa tudo, ou só os eventos de um projeto (basename). */
export function clearRemoteHistory(project?: string): void {
  if (!project) { appStore.set(KEY, []); return; }
  appStore.set(KEY, getRemoteHistory().filter((e) => e.project !== project));
}
