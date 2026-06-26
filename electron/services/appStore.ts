import Store from 'electron-store';

/** Instância única do electron-store. TODOS os módulos do main devem usar esta. */
export const appStore = new Store({ name: 'voltz-ide' }) as unknown as {
  get: (k: string) => unknown;
  set: (k: string, v: unknown) => void;
  delete: (k: string) => void;
};
