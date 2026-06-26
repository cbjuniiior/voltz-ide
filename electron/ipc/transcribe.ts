import { ipcMain, net } from 'electron';

interface TranscribeOpts {
  apiKey: string;
  apiBase: string;
  model: string;
  language?: string;
}

export function registerTranscribeIpc() {
  ipcMain.handle('transcribe:audio', async (
    _evt,
    audioBase64: string,
    mime: string,
    opts: TranscribeOpts,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    if (!opts.apiKey) return { ok: false, error: 'API key não configurada (Configurações → Whisper)' };

    try {
      const audioBuf = Buffer.from(audioBase64, 'base64');
      const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'wav';

      const boundary = '----voltzide' + Date.now();
      const enc = (s: string) => Buffer.from(s, 'utf8');
      const parts: Buffer[] = [];
      parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${opts.model}\r\n`));
      if (opts.language) {
        parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${opts.language}\r\n`));
      }
      parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`));
      parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`));
      parts.push(audioBuf);
      parts.push(enc(`\r\n--${boundary}--\r\n`));
      const body = Buffer.concat(parts);

      const url = `${opts.apiBase.replace(/\/+$/, '')}/audio/transcriptions`;
      const result = await new Promise<{ ok: true; text: string } | { ok: false; error: string }>((resolve) => {
        const req = net.request({ method: 'POST', url });
        req.setHeader('Authorization', `Bearer ${opts.apiKey}`);
        req.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`);
        const chunks: Buffer[] = [];
        req.on('response', (res) => {
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const json = JSON.parse(text);
                resolve({ ok: true, text: (json.text ?? '').trim() });
              } catch {
                resolve({ ok: false, error: 'resposta inválida da API' });
              }
            } else {
              resolve({ ok: false, error: `HTTP ${res.statusCode}: ${text.slice(0, 200)}` });
            }
          });
          res.on('error', (e: Error) => resolve({ ok: false, error: e.message }));
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(body);
        req.end();
      });
      return result;
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
