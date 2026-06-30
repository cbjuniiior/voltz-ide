import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi, PtyCreateOptions, DevServerState } from '../shared/types';

const api: IpcApi = {
  pty: {
    create: (opts: PtyCreateOptions) => ipcRenderer.invoke('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (cb) => {
      const listener = (_: unknown, id: string, data: string) => cb(id, data);
      ipcRenderer.on('pty:data', listener);
      return () => ipcRenderer.removeListener('pty:data', listener);
    },
    onExit: (cb) => {
      const listener = (_: unknown, id: string, code: number) => cb(id, code);
      ipcRenderer.on('pty:exit', listener);
      return () => ipcRenderer.removeListener('pty:exit', listener);
    },
  },
  projects: {
    scan: (roots) => ipcRenderer.invoke('projects:scan', roots),
    readDir: (dirPath) => ipcRenderer.invoke('projects:readDir', dirPath),
  },
  clipboard: {
    getImage: () => ipcRenderer.invoke('clipboard:getImage'),
    saveImage: (base64, ext) => ipcRenderer.invoke('clipboard:saveImage', base64, ext),
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
    readText: () => ipcRenderer.invoke('clipboard:readText'),
  },
  transcribe: {
    audio: (audioBase64, mime, opts) => ipcRenderer.invoke('transcribe:audio', audioBase64, mime, opts),
  },
  claude: {
    detect: () => ipcRenderer.invoke('claude:detect'),
    sessions: (projectPath, configDir) => ipcRenderer.invoke('claude:sessions', projectPath, configDir),
    allSessions: (limit, configDirs) => ipcRenderer.invoke('claude:allSessions', limit, configDirs),
    usage: (configDir) => ipcRenderer.invoke('claude:usage', configDir),
    currentModel: (projectPath, configDir) => ipcRenderer.invoke('claude:currentModel', projectPath, configDir),
    commitMessage: (opts) => ipcRenderer.invoke('claude:commitMessage', opts),
  },
  accounts: {
    defaultDir: () => ipcRenderer.invoke('accounts:defaultDir'),
    createDir: (id) => ipcRenderer.invoke('accounts:createDir', id),
    removeDir: (dir) => ipcRenderer.invoke('accounts:removeDir', dir),
    identity: (dir) => ipcRenderer.invoke('accounts:identity', dir),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickFile: (opts) => ipcRenderer.invoke('dialog:pickFile', opts),
  },
  github: {
    status: () => ipcRenderer.invoke('github:status'),
    listRepos: () => ipcRenderer.invoke('github:listRepos'),
    clone: (cloneUrl, parentDir, name) => ipcRenderer.invoke('github:clone', cloneUrl, parentDir, name),
    onCloneProgress: (cb) => {
      const listener = (_: unknown, p: { phase: string; percent: number }) => cb(p);
      ipcRenderer.on('github:cloneProgress', listener);
      return () => ipcRenderer.removeListener('github:cloneProgress', listener);
    },
  },
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    onChanged: (cb) => {
      const listener = (_: unknown, key: string, value: unknown) => cb(key, value);
      ipcRenderer.on('store:changed', listener);
      return () => ipcRenderer.removeListener('store:changed', listener);
    },
  },
  pip: {
    openTasks: () => ipcRenderer.invoke('pip:openTasks'),
    closeTasks: () => ipcRenderer.invoke('pip:closeTasks'),
    onClosed: (cb) => {
      const listener = () => cb();
      ipcRenderer.on('pip:closed', listener);
      return () => ipcRenderer.removeListener('pip:closed', listener);
    },
    openProjectInMain: (name, projectPath) => ipcRenderer.invoke('window:openProjectInMain', name, projectPath),
    onOpenProject: (cb) => {
      const listener = (_: unknown, name: string, projectPath: string) => cb(name, projectPath);
      ipcRenderer.on('open-project', listener);
      return () => ipcRenderer.removeListener('open-project', listener);
    },
  },
  devServer: {
    start: (projectPath, opts) => ipcRenderer.invoke('devServer:start', projectPath, opts),
    stop: (projectPath) => ipcRenderer.invoke('devServer:stop', projectPath),
    status: (projectPath) => ipcRenderer.invoke('devServer:status', projectPath),
    listAll: () => ipcRenderer.invoke('devServer:listAll'),
    scripts: (projectPath) => ipcRenderer.invoke('devServer:scripts', projectPath),
    openUrl: (url) => ipcRenderer.invoke('devServer:openUrl', url),
    onUpdate: (cb) => {
      const listener = (_: unknown, state: DevServerState) => cb(state);
      ipcRenderer.on('devServer:update', listener);
      return () => ipcRenderer.removeListener('devServer:update', listener);
    },
  },
  skills: {
    install: (projectPath, skillId, body) => ipcRenderer.invoke('skills:install', projectPath, skillId, body),
    listInstalled: (projectPath) => ipcRenderer.invoke('skills:listInstalled', projectPath),
    uninstall: (projectPath, skillId) => ipcRenderer.invoke('skills:uninstall', projectPath, skillId),
    listGlobal: (configDir) => ipcRenderer.invoke('skills:listGlobal', configDir),
    installGlobalFromRepo: (spec, dirs) => ipcRenderer.invoke('skills:installGlobalFromRepo', spec, dirs),
    uninstallGlobal: (skillIds, dirs) => ipcRenderer.invoke('skills:uninstallGlobal', skillIds, dirs),
  },
  updates: {
    onStatus: (cb) => {
      const listener = (_: unknown, status: import('../shared/types').UpdateStatus) => cb(status);
      ipcRenderer.on('updates:status', listener);
      return () => ipcRenderer.removeListener('updates:status', listener);
    },
    current: () => ipcRenderer.invoke('updates:current'),
    check: () => ipcRenderer.invoke('updates:check'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quitAndInstall'),
    simulate: (version) => ipcRenderer.invoke('updates:simulate', version),
  },
  files: {
    stat: (root, target) => ipcRenderer.invoke('files:stat', root, target),
    read: (root, target) => ipcRenderer.invoke('files:read', root, target),
    readDataUrl: (root, target) => ipcRenderer.invoke('files:readDataUrl', root, target),
    write: (root, target, content, opts) => ipcRenderer.invoke('files:write', root, target, content, opts),
    create: (root, target, kind) => ipcRenderer.invoke('files:create', root, target, kind),
    delete: (root, target) => ipcRenderer.invoke('files:delete', root, target),
    rename: (root, fromTarget, toTarget) => ipcRenderer.invoke('files:rename', root, fromTarget, toTarget),
    listAll: (root) => ipcRenderer.invoke('files:listAll', root),
    search: (root, query, opts) => ipcRenderer.invoke('files:search', root, query, opts),
    watchStart: (root) => ipcRenderer.invoke('files:watch:start', root),
    watchStop: (root) => ipcRenderer.invoke('files:watch:stop', root),
    onWatchEvent: (cb) => {
      const listener = (_: unknown, payload: { root: string; event: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'; path: string }) => cb(payload);
      ipcRenderer.on('files:watch:event', listener);
      return () => ipcRenderer.removeListener('files:watch:event', listener);
    },
    gitDiff: (root, target) => ipcRenderer.invoke('files:gitDiff', root, target),
  },
  git: {
    info: (root) => ipcRenderer.invoke('git:info', root),
    branches: (root) => ipcRenderer.invoke('git:branches', root),
    checkout: (root, branch) => ipcRenderer.invoke('git:checkout', root, branch),
    status: (root) => ipcRenderer.invoke('git:status', root),
    stage: (root, paths) => ipcRenderer.invoke('git:stage', root, paths),
    unstage: (root, paths) => ipcRenderer.invoke('git:unstage', root, paths),
    commit: (root, message) => ipcRenderer.invoke('git:commit', root, message),
    diff: (root, staged) => ipcRenderer.invoke('git:diff', root, staged),
    push: (root) => ipcRenderer.invoke('git:push', root),
    pull: (root) => ipcRenderer.invoke('git:pull', root),
    worktreeList: (root) => ipcRenderer.invoke('git:worktreeList', root),
    worktreeAdd: (root, name) => ipcRenderer.invoke('git:worktreeAdd', root, name),
    worktreeRemove: (root, wtPath) => ipcRenderer.invoke('git:worktreeRemove', root, wtPath),
  },
  browser: {
    clearCache: () => ipcRenderer.invoke('browser:clearCache'),
    onPopup: (cb: (data: { url: string; sourceId: number }) => void) => {
      const l = (_: unknown, data: { url: string; sourceId: number }) => cb(data);
      ipcRenderer.on('browser:popup', l);
      return () => ipcRenderer.removeListener('browser:popup', l);
    },
  },
  devPorts: {
    scan: () => ipcRenderer.invoke('devPorts:scan'),
    kill: (pid: number) => ipcRenderer.invoke('devPorts:kill', pid),
  },
  projectMemory: {
    ensure: (projectPath: string, projectName: string) => ipcRenderer.invoke('projectMemory:ensure', projectPath, projectName),
  },
  app: {
    platform: process.platform,
  },
  system: {
    openInExplorer: (target) => ipcRenderer.invoke('system:openInExplorer', target),
    metrics: () => ipcRenderer.invoke('system:metrics'),
    optimize: () => ipcRenderer.invoke('system:optimize'),
  },
  remote: {
    status: () => ipcRenderer.invoke('remote:status'),
    setToken: (token: string | null) => ipcRenderer.invoke('remote:setToken', token),
    setEnabled: (on: boolean) => ipcRenderer.invoke('remote:setEnabled', on),
    setProjectEnabled: (p: string, on: boolean) => ipcRenderer.invoke('remote:setProjectEnabled', p, on),
    listProjectsEnabled: () => ipcRenderer.invoke('remote:listProjectsEnabled'),
    generatePairingCode: () => ipcRenderer.invoke('remote:generatePairingCode'),
    unpair: () => ipcRenderer.invoke('remote:unpair'),
    getHistory: () => ipcRenderer.invoke('remote:getHistory'),
    clearHistory: (project?: string) => ipcRenderer.invoke('remote:clearHistory', project),
    onStatus: (cb) => {
      const listener = (_: unknown, s: import('../shared/types').RemoteStatusInfo) => cb(s);
      ipcRenderer.on('remote:status', listener);
      return () => ipcRenderer.removeListener('remote:status', listener);
    },
    onActivity: (cb) => {
      const listener = (_: unknown, e: import('../shared/types').RemoteActivity) => cb(e);
      ipcRenderer.on('remote:activity', listener);
      return () => ipcRenderer.removeListener('remote:activity', listener);
    },
  },
  procMonitor: {
    onSample: (cb) => {
      const listener = (_: unknown, sample: import('../shared/types').ProcSample) => cb(sample);
      ipcRenderer.on('procMonitor:sample', listener);
      return () => ipcRenderer.removeListener('procMonitor:sample', listener);
    },
    sampleNow: (terminalId) => ipcRenderer.invoke('procMonitor:sampleNow', terminalId),
  },
  shortcuts: {
    onInvoke: (cb: (action: string) => void) => {
      const listener = (_: unknown, action: string) => cb(action);
      ipcRenderer.on('shortcut:invoke', listener);
      return () => ipcRenderer.removeListener('shortcut:invoke', listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
