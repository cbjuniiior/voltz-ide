import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let logPath: string | null = null;

/** Log de diagnóstico do controle remoto → <userData>/remote-diag.log */
export function rlog(msg: string) {
  try {
    if (!logPath) logPath = path.join(app.getPath('userData'), 'remote-diag.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}
