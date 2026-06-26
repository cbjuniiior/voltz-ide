import { EventEmitter } from 'node:events';
import { ptyEvents, getPtyCwd } from '../ptyManager';
import { classifyChunk, looksLikeClaude } from './detect';

export type ClaudeState = 'running' | 'approval' | 'idle';
const IDLE_MS = 1800;
const READY_MS = 1500; // tempo após o último output para considerar o Claude "pronto"
const BUFFER_MAX = 4000;

interface TermState {
  state: ClaudeState;
  buffer: string;       // texto recente (já sem ANSI) p/ extrair alvo de aprovação
  isClaude: boolean;    // este terminal está rodando o Claude Code?
  readyFired: boolean;  // já emitimos 'ready' para este terminal?
  idleTimer?: NodeJS.Timeout;
  readyTimer?: NodeJS.Timeout;
}

/**
 * Observa o stream dos PTYs e emite:
 *  - `status` { id, cwd, state }  — mudança de estado (running/approval/idle)
 *  - `ready`  { id, cwd }         — o Claude apareceu e assentou (1x por terminal)
 */
export class ClaudeWatcher extends EventEmitter {
  private terms = new Map<string, TermState>();

  start() {
    ptyEvents.on('data', this.onData);
    ptyEvents.on('exit', this.onExit);
  }
  stop() {
    ptyEvents.off('data', this.onData);
    ptyEvents.off('exit', this.onExit);
    for (const t of this.terms.values()) {
      if (t.idleTimer) clearTimeout(t.idleTimer);
      if (t.readyTimer) clearTimeout(t.readyTimer);
    }
    this.terms.clear();
  }

  getState(id: string): ClaudeState | null { return this.terms.get(id)?.state ?? null; }
  getRecentText(id: string): string { return this.terms.get(id)?.buffer ?? ''; }
  getIsClaude(id: string): boolean { return this.terms.get(id)?.isClaude ?? false; }

  private onData = (id: string, data: string) => {
    const { activity, approval } = classifyChunk(data);
    let t = this.terms.get(id);
    if (!t) { t = { state: 'idle', buffer: '', isClaude: false, readyFired: false }; this.terms.set(id, t); }
    // buffer recente (sem ANSI) limitado
    t.buffer = (t.buffer + data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')).slice(-BUFFER_MAX);

    if (looksLikeClaude(data)) t.isClaude = true;
    // Dispara 'ready' 1.5s após o último output, na primeira vez que o Claude aparece.
    if (t.isClaude && !t.readyFired) {
      const tt = t;
      if (tt.readyTimer) clearTimeout(tt.readyTimer);
      tt.readyTimer = setTimeout(() => {
        tt.readyFired = true;
        this.emit('ready', { id, cwd: getPtyCwd(id) ?? '' });
      }, READY_MS);
    }

    if (approval) { this.setState(id, t, 'approval'); return; }
    if (activity) {
      this.setState(id, t, 'running');
      if (t.idleTimer) clearTimeout(t.idleTimer);
      t.idleTimer = setTimeout(() => this.setState(id, t!, 'idle'), IDLE_MS);
    }
  };

  private onExit = (id: string) => {
    const t = this.terms.get(id);
    if (t?.idleTimer) clearTimeout(t.idleTimer);
    if (t?.readyTimer) clearTimeout(t.readyTimer);
    this.terms.delete(id);
  };

  private setState(id: string, t: TermState, state: ClaudeState) {
    if (t.state === state) return;
    t.state = state;
    this.emit('status', { id, cwd: getPtyCwd(id) ?? '', state });
  }
}
