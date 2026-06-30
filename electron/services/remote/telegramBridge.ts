import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TelegramApi, type TgUpdate } from './telegramApi';
import { getRemoteConfig, setRemoteConfig } from './config';
import { isOwner, generatePairingCode } from './pairing';
import { sliceForTelegram } from './messages';
import { HeadlessManager } from './headless';
import { TunnelManager } from './tunnel';
import { transcribeAudio } from '../../ipc/transcribe';
import { appStore } from '../appStore';
import { getDevServerState, startDevServer, getDevScripts, onDevServerUpdate } from '../devServerManager';
import type { RemoteStatusInfo, RemoteActivity } from '../../../shared/types';

function baseName(p: string) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

/**
 * Ponte do controle remoto via Telegram. Modo HEADLESS: cada pedido roda o
 * `claude -p --output-format stream-json` no projeto e faz streaming da saída
 * limpa de volta — sem TUI, sem adivinhar arquivo de sessão.
 */
export class TelegramBridge {
  private api: TelegramApi | null = null;
  private offset = 0;
  private polling = false;
  private botUsername: string | null = null;
  private error: string | undefined;
  private pairingCode: string | null = null;
  private activeProject: string | null = null;   // projeto ativo da conversa (1 chat)
  private headless = new HeadlessManager();
  private tunnel = new TunnelManager();
  private queues = new Map<string, string[]>();   // fila de pedidos por projeto
  private pendingApproval: { project: string; denials: string[] } | null = null;

  constructor(private onStatusChange: () => void, private onActivity: (e: RemoteActivity) => void) {}

  status(): RemoteStatusInfo {
    const cfg = getRemoteConfig();
    return { running: this.polling, botUsername: this.botUsername, paired: !!cfg.ownerChatId, pairingCode: this.pairingCode, error: this.error };
  }

  generatePairing(): string { this.pairingCode = generatePairingCode(); this.onStatusChange(); return this.pairingCode; }

  private logActivity(kind: RemoteActivity['kind'], project: string | undefined, text: string) {
    this.onActivity({ ts: Date.now(), kind, project: project ? baseName(project) : undefined, text });
  }

  async start() {
    if (this.polling) return;
    const cfg = getRemoteConfig();
    if (!cfg.enabled || !cfg.token) return;
    this.api = new TelegramApi(cfg.token);
    try {
      const me = await this.api.getMe();
      this.botUsername = me.username; this.error = undefined;
    } catch (e) { this.error = (e as Error).message; this.onStatusChange(); return; }
    // Descarta o backlog (mensagens anteriores ao app subir).
    try {
      const old = await this.api.getUpdates(-1, 0);
      if (old.length) this.offset = old[old.length - 1].update_id + 1;
    } catch { /* ignore */ }
    this.polling = true;
    this.onStatusChange();
    void this.loop();
  }

  stop() {
    this.polling = false;
    this.headless.stopAll();
    this.tunnel.stop();
    this.api = null; this.botUsername = null;
    this.onStatusChange();
  }

  private async loop() {
    while (this.polling && this.api) {
      try {
        const updates = await this.api.getUpdates(this.offset, 30);
        for (const u of updates) { this.offset = u.update_id + 1; await this.handleUpdate(u); }
      } catch (e) {
        this.error = (e as Error).message;
        await new Promise((r) => setTimeout(r, 3000)); // backoff
      }
    }
  }

  private send(chatId: number | string, text: string, buttons?: { text: string; callback_data: string }[][]) {
    if (!this.api) return;
    return this.api.sendMessage(chatId, text, buttons).catch(() => {});
  }

  // ---- roteamento ----
  private async handleUpdate(u: TgUpdate) {
    const cfg = getRemoteConfig();
    if (u.callback_query) return this.handleCallback(u, cfg.ownerChatId);
    const msg = u.message; if (!msg) return;
    const chatId = msg.chat.id;
    const text = (msg.text ?? '').trim();
    const hasPhoto = !!(msg.photo && msg.photo.length);

    // pareamento (antes do owner-check, pois ainda não há dono)
    if (text.startsWith('/pair')) {
      const code = text.split(/\s+/)[1];
      if (this.pairingCode && code === this.pairingCode) {
        setRemoteConfig({ ownerChatId: String(chatId) });
        this.pairingCode = null; this.onStatusChange();
        this.logActivity('info', undefined, 'Celular pareado pelo Telegram');
        return void this.send(chatId, '✅ Pareado! Use /projects para começar.');
      }
      return void this.send(chatId, '❌ Código inválido. Gere um novo no app (Configurações → Remoto).');
    }
    if (!isOwner(chatId, getRemoteConfig().ownerChatId)) return; // ignora estranhos

    if (text === '/start' || text === '/help') return void this.send(chatId,
      'Voltz IDE remoto.\n/projects — escolher projeto\n/preview — link público do dev server\n/status — situação\n/stop — cancelar pedido\n\nDica: pode mandar foto (eu leio a imagem) e enfileirar pedidos enquanto eu trabalho.');
    if (text === '/projects' || text === '/p') return this.sendProjectList(chatId);
    if (text === '/status') return this.sendStatus(chatId);
    if (text === '/stop') {
      this.queues.delete(this.activeProject ?? '');
      if (this.activeProject && this.headless.stop(this.activeProject)) return void this.send(chatId, '🛑 Pedido cancelado (e fila limpa).');
      return void this.send(chatId, 'Nada rodando agora.');
    }
    if (text === '/preview' || text.startsWith('/preview ')) { void this.handlePreview(chatId, text); return; }

    // foto / voz / texto = pedido pro Claude no projeto ativo
    const voice = msg.voice ?? msg.audio;
    if (!hasPhoto && !text && !voice) return;
    if (!this.activeProject) return void this.send(chatId, 'Escolha um projeto primeiro: /projects');
    const project = this.activeProject;

    if (voice) { void this.handleVoicePrompt(chatId, project, voice); return; }
    if (hasPhoto) { void this.handlePhotoPrompt(chatId, project, msg); return; }
    this.submitPrompt(chatId, project, text);
  }

  /** Enfileira (se já estiver rodando) ou roda o pedido agora. */
  private submitPrompt(chatId: number, project: string, prompt: string) {
    if (this.headless.isRunning(project) || this.pendingApproval?.project === project) {
      const q = this.queues.get(project) ?? []; q.push(prompt); this.queues.set(project, q);
      void this.send(chatId, `📥 Na fila (${q.length}). Rodo assim que terminar o atual.`);
      return;
    }
    this.runPrompt(chatId, project, prompt);
  }

  /** Roda um pedido no headless e trata resposta, fila e aprovação. */
  private runPrompt(chatId: number, project: string, prompt: string, bypass = false) {
    this.logActivity('prompt', project, prompt);
    void this.send(chatId, bypass ? '🔓 Aprovado — continuando…' : '⏳ Pensando…');
    void this.headless.ask(project, prompt, {
      onText: (t) => { this.logActivity('response', project, t.slice(0, 120)); for (const c of sliceForTelegram(t)) void this.send(chatId, c); },
      onTool: (s) => { this.logActivity('info', project, s); void this.send(chatId, '▸ ' + s); },
      onError: (m) => { void this.send(chatId, '⚠️ ' + m); this.drainQueue(chatId, project); },
      onDone: (_res, denials) => {
        if (denials.length && !bypass) {
          this.pendingApproval = { project, denials };
          const list = denials.slice(0, 8).map((d) => '• ' + d).join('\n');
          void this.send(chatId, `🔐 O Claude precisou de permissão para:\n${list}\n\nAprovar e executar?`, [[
            { text: '✅ Aprovar', callback_data: 'appr' },
            { text: '❌ Não', callback_data: 'deny' },
          ]]);
          return; // espera a decisão antes de seguir a fila
        }
        void this.send(chatId, '✅ Concluído.');
        this.drainQueue(chatId, project);
      },
    }, { bypass });
  }

  /** Roda o próximo pedido da fila do projeto, se houver. */
  private drainQueue(chatId: number, project: string) {
    const q = this.queues.get(project);
    if (!q || !q.length) return;
    const next = q.shift()!;
    void this.send(chatId, `▶️ Próximo da fila (${q.length} restante${q.length === 1 ? '' : 's'})…`);
    this.runPrompt(chatId, project, next);
  }

  /** Baixa a foto do Telegram e manda pro Claude ler (via ferramenta Read). */
  private async handlePhotoPrompt(chatId: number, project: string, msg: NonNullable<TgUpdate['message']>) {
    const photos = msg.photo!;
    const largest = photos[photos.length - 1]; // maior resolução
    void this.send(chatId, '🖼️ Baixando a imagem…');
    let imgPath: string;
    try {
      const f = await this.api!.getFile(largest.file_id);
      if (!f.file_path) throw new Error('sem file_path');
      const dir = path.join(os.tmpdir(), 'voltz-remote');
      await fs.mkdir(dir, { recursive: true });
      imgPath = path.join(dir, `tg_${Date.now()}_${path.basename(f.file_path)}`);
      await this.api!.downloadFile(f.file_path, imgPath);
    } catch (e) {
      return void this.send(chatId, '⚠️ Não consegui baixar a imagem: ' + (e as Error).message);
    }
    const caption = (msg.caption ?? '').trim();
    const prompt = `${caption || 'Veja a imagem em anexo e me diga o que é / o que devo fazer.'}\n\n[Imagem anexada salva em: ${imgPath} — use a ferramenta Read para visualizá-la.]`;
    this.submitPrompt(chatId, project, prompt);
  }

  /** Transcreve uma mensagem de voz (Whisper) e roda o texto como pedido. */
  private async handleVoicePrompt(chatId: number, project: string, voice: { file_id: string; mime_type?: string }) {
    const settings = (appStore.get('settings') as { whisperApiKey?: string; whisperApiBase?: string; whisperModel?: string } | undefined) ?? {};
    if (!settings.whisperApiKey) {
      return void this.send(chatId, '⚠️ Pra eu transcrever áudio, configure a chave do Whisper no app (a mesma do microfone do terminal, em Configurações).');
    }
    void this.send(chatId, '🎤 Transcrevendo o áudio…');
    let buf: Buffer;
    const mime = voice.mime_type || 'audio/ogg';
    try {
      const f = await this.api!.getFile(voice.file_id);
      if (!f.file_path) throw new Error('sem file_path');
      const dir = path.join(os.tmpdir(), 'voltz-remote');
      await fs.mkdir(dir, { recursive: true });
      const p = path.join(dir, `tg_${Date.now()}_${path.basename(f.file_path)}`);
      await this.api!.downloadFile(f.file_path, p);
      buf = await fs.readFile(p);
    } catch (e) {
      return void this.send(chatId, '⚠️ Não consegui baixar o áudio: ' + (e as Error).message);
    }
    const r = await transcribeAudio(buf, mime, {
      apiKey: settings.whisperApiKey,
      apiBase: settings.whisperApiBase || 'https://api.groq.com/openai/v1',
      model: settings.whisperModel || 'whisper-large-v3-turbo',
      language: 'pt',
    });
    if (!r.ok) return void this.send(chatId, '⚠️ Falha ao transcrever: ' + r.error);
    if (!r.text.trim()) return void this.send(chatId, '🤔 Não captei nada no áudio. Tenta de novo?');
    void this.send(chatId, `🗣️ Entendi: "${r.text}"`);
    this.submitPrompt(chatId, project, r.text);
  }

  private async handleCallback(u: TgUpdate, ownerChatId: string | null) {
    const cq = u.callback_query!; const chatId = cq.message?.chat.id;
    if (!chatId || !isOwner(chatId, ownerChatId)) return;
    const [action, project] = (cq.data ?? '').split('|');
    if (action === 'pick') {
      this.activeProject = project;
      await this.api?.answerCallbackQuery(cq.id, `Ativo: ${baseName(project)}`);
      return void this.send(chatId, `Projeto ativo: ${baseName(project)}. Mande seu pedido.`);
    }
    if (action === 'appr') {
      const pa = this.pendingApproval; this.pendingApproval = null;
      await this.api?.answerCallbackQuery(cq.id, 'Aprovado');
      if (pa) this.runPrompt(chatId, pa.project, 'Continue de onde parou e execute as ações que faltaram — permissão concedida.', true);
      return;
    }
    if (action === 'deny') {
      const pa = this.pendingApproval; this.pendingApproval = null;
      await this.api?.answerCallbackQuery(cq.id, 'Negado');
      void this.send(chatId, '❌ Ok, não executei. Pode me pedir outra coisa.');
      if (pa) this.drainQueue(chatId, pa.project);
      return;
    }
  }

  // ---- preview (túnel público) ----
  private async handlePreview(chatId: number, text: string) {
    const arg = text.split(/\s+/)[1];
    if (arg === 'stop') { this.tunnel.stop(); return void this.send(chatId, '🛑 Túnel encerrado.'); }

    const explicitPort = arg && /^\d{2,5}$/.test(arg) ? parseInt(arg, 10) : 0;
    if (!explicitPort && !this.activeProject) return void this.send(chatId, 'Escolha um projeto primeiro: /projects');

    let port = explicitPort;
    if (!port) {
      try {
        port = await this.ensureDevServer(this.activeProject!, (m) => void this.send(chatId, m));
      } catch (e) {
        return void this.send(chatId, '⚠️ ' + (e as Error).message
          + '.\nVocê pode subir o Dev no app e tentar de novo, ou informar a porta: /preview 5173');
      }
    }

    void this.send(chatId, `🌐 Criando link público para localhost:${port}… (a 1ª vez pode levar alguns segundos)`);
    try {
      const url = await this.tunnel.start(port);
      this.logActivity('info', this.activeProject ?? undefined, `Preview: ${url}`);
      void this.send(chatId, `✅ Preview no ar:\n${url}\n\nAbra no navegador do celular. (/preview stop para encerrar)`);
    } catch (e) {
      void this.send(chatId, '⚠️ Não consegui criar o túnel (' + (e as Error).message + '). Tente /preview de novo.');
    }
  }

  /** Garante um dev server rodando para o projeto e devolve a porta (sobe se preciso). */
  private async ensureDevServer(project: string, onProgress: (m: string) => void): Promise<number> {
    const portOf = (url: string | null) => { const m = url ? /:(\d{2,5})\b/.exec(url) : null; return m ? parseInt(m[1], 10) : 0; };

    const cur = getDevServerState(project);
    if (cur && cur.url && (cur.phase === 'running' || cur.phase === 'starting')) {
      const p = portOf(cur.url); if (p) return p;
    }

    const scripts = getDevScripts(project);
    const script = scripts.includes('dev') ? 'dev' : scripts.includes('start') ? 'start' : scripts[0];
    if (!script) throw new Error('o projeto não tem scripts no package.json para rodar');

    onProgress(`🚀 Subindo o dev server (\`${script}\`)… isso pode levar alguns segundos`);
    const res = await startDevServer(project, { skipInstall: true, script });
    if (!res.ok) {
      const p = portOf(getDevServerState(project)?.url ?? null);
      if (p) return p;                       // já estava rodando
      throw new Error(res.error);
    }

    // espera a URL surgir no log do dev server (ou erro/timeout)
    return new Promise<number>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; unsub(); clearTimeout(timer); fn(); };
      const unsub = onDevServerUpdate((s) => {
        if (s.projectPath !== project) return;
        const p = portOf(s.url);
        if (p) return finish(() => resolve(p));
        if (s.phase === 'error') return finish(() => reject(new Error(s.errorMessage || 'o dev server falhou ao subir')));
      });
      const timer = setTimeout(() => finish(() => reject(new Error('o dev server demorou demais para responder'))), 90000);
      const now = portOf(getDevServerState(project)?.url ?? null); // caso já tenha surgido
      if (now) finish(() => resolve(now));
    });
  }

  // ---- helpers ----
  private sendProjectList(chatId: number) {
    const cfg = getRemoteConfig();
    if (!cfg.projects.length) return void this.send(chatId, 'Nenhum projeto habilitado. Marque projetos em Configurações → Remoto.');
    const buttons = cfg.projects.map((p) => [{ text: baseName(p), callback_data: `pick|${p}` }]);
    void this.send(chatId, 'Escolha um projeto:', buttons);
  }

  private sendStatus(chatId: number) {
    const cfg = getRemoteConfig();
    const lines = cfg.projects.map((p) => `• ${baseName(p)}: ${this.headless.isRunning(p) ? 'processando…' : 'pronto'}`);
    const active = this.activeProject ? `\nAtivo: ${baseName(this.activeProject)}` : '';
    const tun = this.tunnel.current();
    const tunLine = tun ? `\n🌐 Preview: ${tun.url}` : '';
    void this.send(chatId, (lines.join('\n') || 'Nada habilitado.') + active + tunLine);
  }
}
