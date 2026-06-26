// Notificações nativas + um beep curto via Web Audio (sem arquivos).

let audioCtx: AudioContext | null = null;

/** Pede permissão de notificação uma vez (chamar no boot). */
export function ensureNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch { /* ignore */ }
}

/** Beep curto e discreto. */
export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1180, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch { /* ignore */ }
}

/** Notificação genérica do SO (se permitida) + beep. */
export function notifySystem(title: string, body: string) {
  beep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, silent: true });
      n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
    }
  } catch { /* ignore */ }
}

/**
 * Aviso de "Claude terminou / pediu aprovação".
 * - sound: toca o beep curto.
 * - system: mostra a notificação nativa do SO (janelinha do Windows/macOS).
 */
export function notifyClaudeDone(project: string, opts?: { sound?: boolean; system?: boolean; approval?: boolean }) {
  const sound = opts?.sound ?? true;
  const system = opts?.system ?? true;
  if (sound) beep();
  if (!system) return;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const title = opts?.approval ? 'Claude pede sua confirmação' : 'Claude terminou';
      const n = new Notification(title, {
        body: project ? `Projeto: ${project}` : 'Aguardando você.',
        silent: true,
      });
      n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
    }
  } catch { /* ignore */ }
}
