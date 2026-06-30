import { net } from 'electron';
import fs from 'node:fs';
import { mdToTelegramHtml } from './htmlFormat';

interface InlineButton { text: string; callback_data: string }

export interface TgPhotoSize { file_id: string; file_size?: number; width?: number; height?: number }
export interface TgFile { file_id: string; mime_type?: string; duration?: number; file_size?: number }

export interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string; caption?: string;
    photo?: TgPhotoSize[];
    voice?: TgFile;   // nota de voz (microfone)
    audio?: TgFile;   // arquivo de áudio enviado
  };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
}

export class TelegramApi {
  constructor(private token: string) {}

  private base() { return `https://api.telegram.org/bot${this.token}`; }

  // Usa o módulo `net` do Electron (stack de rede do Chromium): respeita o proxy
  // do sistema e funciona em redes onde o fetch do Node (undici) dá "fetch failed".
  private call<T>(method: string, body?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const req = net.request({ method: 'POST', url: `${this.base()}/${method}` });
      req.setHeader('content-type', 'application/json');
      let data = '';
      req.on('response', (res) => {
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { ok: boolean; result?: T; description?: string };
            if (!json.ok) reject(new Error(json.description || `Telegram ${method} falhou`));
            else resolve(json.result as T);
          } catch {
            reject(new Error('Resposta inválida do Telegram (verifique o token).'));
          }
        });
      });
      req.on('error', (err) => reject(new Error(err.message || 'Falha de rede ao falar com o Telegram.')));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  getMe(): Promise<{ id: number; username: string }> {
    return this.call('getMe');
  }

  getUpdates(offset: number, timeoutSec = 30): Promise<TgUpdate[]> {
    return this.call('getUpdates', { offset, timeout: timeoutSec });
  }

  // Envia em HTML (negrito/itálico/código do markdown do Claude renderizam).
  // Se o Telegram recusar o HTML (entidade malformada por um corte no meio de
  // uma tag, p.ex.), reenvia como texto puro — nunca perde a mensagem.
  async sendMessage(chatId: number | string, text: string, buttons?: InlineButton[][]): Promise<{ message_id: number }> {
    const reply_markup = buttons ? { inline_keyboard: buttons } : undefined;
    try {
      return await this.call('sendMessage', {
        chat_id: chatId,
        text: mdToTelegramHtml(text),
        parse_mode: 'HTML',
        reply_markup,
      });
    } catch {
      return this.call('sendMessage', { chat_id: chatId, text, reply_markup });
    }
  }

  editMessageText(chatId: number | string, messageId: number, text: string): Promise<unknown> {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text });
  }

  answerCallbackQuery(id: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: id, text });
  }

  getFile(fileId: string): Promise<{ file_path?: string }> {
    return this.call('getFile', { file_id: fileId });
  }

  /** Baixa um arquivo do Telegram (foto/anexo) para `dest`. */
  downloadFile(filePath: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = net.request(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
      req.on('response', (res) => {
        if ((res.statusCode ?? 0) >= 400) { reject(new Error('download falhou: HTTP ' + res.statusCode)); return; }
        const out = fs.createWriteStream(dest);
        (res as unknown as NodeJS.ReadableStream).pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }
}
