import { appStore } from '../appStore';

export interface RemoteConfig {
  enabled: boolean;
  token: string | null;
  ownerChatId: string | null;
  projects: string[]; // paths habilitados
}

const KEY = 'remote';

export function getRemoteConfig(): RemoteConfig {
  const raw = (appStore.get(KEY) as Partial<RemoteConfig>) ?? {};
  return {
    enabled: raw.enabled ?? false,
    token: raw.token ?? null,
    ownerChatId: raw.ownerChatId ?? null,
    projects: raw.projects ?? [],
  };
}

export function setRemoteConfig(patch: Partial<RemoteConfig>): RemoteConfig {
  const next = { ...getRemoteConfig(), ...patch };
  appStore.set(KEY, next);
  return next;
}
