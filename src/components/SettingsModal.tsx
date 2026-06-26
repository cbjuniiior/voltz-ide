import { useEffect, useMemo, useState } from 'react';
import {
  FolderPlus, Search, Trash2, X, Sun, Moon, Monitor as MonitorIcon, Check, RefreshCw,
  Palette, FolderTree, SquareTerminal, Sparkles, Code2, Bell, Server, Mic, Info, Folder, Smartphone, ChevronDown,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useProjectsStore } from '@/stores/projects';
import { useUpdateStore } from '@/stores/update';
import { useRemoteStore } from '@/stores/remote';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { toast } from '@/stores/toasts';
import type { ClaudeDetectResult, ShellKind, ThemeMode, RemoteActivity } from '@shared/types';
import { TERMINAL_THEMES, TERMINAL_THEME_GROUPS } from '@/lib/terminalThemes';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATS = [
  { id: 'appearance', label: 'Aparência', icon: Palette, desc: 'Tema e visual da interface.' },
  { id: 'projects', label: 'Projetos', icon: FolderTree, desc: 'Pastas raiz que o app escaneia em busca de projetos.' },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal, desc: 'Shell padrão, fonte e tema dos terminais.' },
  { id: 'ai', label: 'Claude / IA', icon: Sparkles, desc: 'Binário e comando usados para rodar o Claude Code.' },
  { id: 'editor', label: 'Editor', icon: Code2, desc: 'Comportamento do editor de código embutido.' },
  { id: 'notifications', label: 'Notificações', icon: Bell, desc: 'Avisos quando o Claude termina ou pede aprovação.' },
  { id: 'devserver', label: 'Dev Server', icon: Server, desc: 'O que acontece quando o dev server sobe.' },
  { id: 'voice', label: 'Ditado por voz', icon: Mic, desc: 'Transcrição de áudio via Whisper / OpenAI.' },
  { id: 'about', label: 'Sobre & Updates', icon: Info, desc: 'Versão do app e atualizações.' },
  { id: 'remote', label: 'Remoto', icon: Smartphone, desc: 'Controle o Claude pelo celular via bot do Telegram.' },
] as const;
type CatId = typeof CATS[number]['id'];

const TERMINAL_FONTS: { label: string; value: string }[] = [
  { label: 'Padrão (Cascadia Code)', value: '' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", "Cascadia Mono", monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace' },
  { label: 'Hack', value: '"Hack", monospace' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Menlo / Monaco', value: 'Menlo, Monaco, monospace' },
  { label: 'Ubuntu Mono', value: '"Ubuntu Mono", monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

export function SettingsModal({ open, onClose }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const scan = useProjectsStore((s) => s.scan);
  const [detect, setDetect] = useState<ClaudeDetectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<CatId>('appearance');

  useEffect(() => {
    if (!open) return;
    void runDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function runDetect() {
    setBusy(true);
    try {
      const r = await window.api.claude.detect();
      setDetect(r);
      if (!settings.claudePath && r.path) await update({ claudePath: r.path });
    } finally {
      setBusy(false);
    }
  }

  async function addRoot() {
    const folder = await window.api.dialog.pickFolder();
    if (!folder || settings.rootFolders.includes(folder)) return;
    const next = [...settings.rootFolders, folder];
    await update({ rootFolders: next });
    await scan(next);
  }
  async function removeRoot(p: string) {
    const next = settings.rootFolders.filter((r) => r !== p);
    await update({ rootFolders: next });
    await scan(next);
  }

  if (!open) return null;
  const cat = CATS.find((c) => c.id === active)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-md" onClick={onClose}>
      <div
        className="cmd-enter relative flex h-[82vh] max-h-[760px] w-full max-w-[900px] overflow-hidden rounded-2xl bg-bg-surface"
        style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.05)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <nav className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-bg-base p-2.5">
          <div className="flex items-center gap-2 px-2 pb-3 pt-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <SquareTerminal size={15} />
            </span>
            <span className="text-[14px] font-bold tracking-tight text-text-primary">Configurações</span>
          </div>
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {CATS.map((c) => {
              const on = c.id === active;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors"
                  style={{
                    background: on ? 'var(--accent-soft)' : 'transparent',
                    color: on ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <c.icon size={15} className="shrink-0" />
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-7 py-4">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-text-primary">{cat.label}</h2>
              <p className="mt-0.5 text-[11.5px] text-text-tertiary">{cat.desc}</p>
            </div>
            <button onClick={onClose} className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary" aria-label="Fechar (Esc)">
              <X size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-7 py-5">
            {active === 'appearance' && (
              <div className="grid grid-cols-3 gap-2.5">
                <ThemeOption mode="system" current={settings.theme} onSelect={(m) => update({ theme: m })} icon={<MonitorIcon size={18} />} label="Sistema" preview={['#1a1a1d', '#ececed']} />
                <ThemeOption mode="light" current={settings.theme} onSelect={(m) => update({ theme: m })} icon={<Sun size={18} />} label="Claro" preview={['#f5f5f7', '#1a1a1d']} />
                <ThemeOption mode="dark" current={settings.theme} onSelect={(m) => update({ theme: m })} icon={<Moon size={18} />} label="Escuro" preview={['#151518', '#ececed']} />
              </div>
            )}

            {active === 'projects' && (
              <>
                <div className="space-y-1.5">
                  {settings.rootFolders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-[12px] text-text-muted">
                      Nenhuma pasta cadastrada ainda.
                    </div>
                  )}
                  {settings.rootFolders.map((r) => (
                    <div key={r} className="group flex items-center gap-2.5 rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                      <Folder size={15} className="shrink-0 text-accent" />
                      <span className="flex-1 truncate text-[12px] text-text-primary" title={r}>{r}</span>
                      <button onClick={() => removeRoot(r)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-disabled opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label="Remover">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addRoot} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-default py-2.5 text-[12px] font-medium text-text-tertiary transition-colors hover:border-accent hover:text-accent">
                  <FolderPlus size={14} /> Adicionar pasta raiz
                </button>
                <p className="px-1 text-[11px] leading-relaxed text-text-muted">O app lista as subpastas (profundidade 1) de cada raiz como projetos.</p>
              </>
            )}

            {active === 'terminal' && (
              <>
                <Field label="Shell padrão">
                  <select
                    value={settings.defaultShell}
                    onChange={(e) => update({ defaultShell: e.target.value as ShellKind })}
                    className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-primary outline-none transition-colors focus:border-accent"
                  >
                    {window.api.app.platform === 'win32' ? (
                      <>
                        <option value="pwsh">PowerShell (Windows)</option>
                        <option value="cmd">cmd.exe</option>
                        <option value="bash">Bash (Git Bash / WSL)</option>
                      </>
                    ) : (
                      <>
                        <option value="zsh">zsh (shell de login)</option>
                        <option value="bash">bash</option>
                      </>
                    )}
                  </select>
                </Field>
                <Field label="Fonte do terminal" hint="Fontes não instaladas no sistema caem para a monoespaçada padrão.">
                  <select
                    value={settings.terminalFontFamily}
                    onChange={(e) => update({ terminalFontFamily: e.target.value })}
                    className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-primary outline-none transition-colors focus:border-accent"
                    style={{ fontFamily: settings.terminalFontFamily || undefined }}
                  >
                    {TERMINAL_FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label={`Tamanho da fonte — ${settings.fontSize}px`}>
                  <input type="range" min={9} max={24} value={settings.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
                </Field>
                <Field label="Estilo do cursor">
                  <div className="flex gap-1.5">
                    {([['bar', 'Barra'], ['block', 'Bloco'], ['underline', 'Sublinhado']] as const).map(([cs, lbl]) => {
                      const on = settings.terminalCursorStyle === cs;
                      return (
                        <button
                          key={cs}
                          onClick={() => update({ terminalCursorStyle: cs })}
                          className="flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-medium transition-colors"
                          style={{ background: on ? 'var(--accent-soft)' : 'var(--bg-base)', borderColor: on ? 'var(--accent)' : 'var(--border-subtle)', color: on ? 'var(--accent)' : 'var(--text-secondary)' }}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <SettingRow title="Cursor piscando" desc="O cursor do terminal pisca em vez de ficar fixo.">
                  <Toggle checked={settings.terminalCursorBlink} onChange={(v) => update({ terminalCursorBlink: v })} />
                </SettingRow>
                <Field label="Tema do terminal" hint="Padrão para novos terminais — cada painel pode trocar individualmente.">
                  <TerminalThemePicker current={settings.terminalTheme} onSelect={(id) => update({ terminalTheme: id })} />
                </Field>
              </>
            )}

            {active === 'ai' && (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                  <span className="text-[11px] text-text-muted">Detectado:</span>
                  <code className="flex-1 truncate font-mono text-[11px] text-text-primary">{detect?.path || (busy ? 'detectando…' : 'não encontrado')}</code>
                  <button onClick={() => void runDetect()} className="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary">
                    <Search size={11} /> Detectar
                  </button>
                </div>
                <Field label="Caminho do binário (opcional)">
                  <Input value={settings.claudePath ?? ''} onChange={(v) => update({ claudePath: v || null })} placeholder="C:\\Users\\…\\claude.exe" />
                </Field>
                <Field label="Comando alternativo" hint="Usado quando o caminho está vazio.">
                  <Input value={settings.claudeCommand} onChange={(v) => update({ claudeCommand: v })} placeholder="claude  ou  bun x @anthropic-ai/claude-code" />
                </Field>
              </>
            )}

            {active === 'editor' && (
              <>
                <SettingRow title="Auto-save" desc={`Salva o arquivo ${settings.editorAutoSaveDelayMs}ms depois que você para de digitar.`}>
                  <Toggle checked={settings.editorAutoSave} onChange={(v) => update({ editorAutoSave: v })} />
                </SettingRow>
                {settings.editorAutoSave && (
                  <Field label={`Atraso do auto-save — ${settings.editorAutoSaveDelayMs}ms`}>
                    <input type="range" min={300} max={3000} step={100} value={settings.editorAutoSaveDelayMs} onChange={(e) => update({ editorAutoSaveDelayMs: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
                  </Field>
                )}
              </>
            )}

            {active === 'notifications' && (
              <>
                <SettingRow title="Notificação do sistema" desc="Janelinha nativa do Windows/macOS quando o Claude termina ou pede aprovação fora da aba ativa.">
                  <Toggle checked={settings.notifyClaudeIdle} onChange={(v) => update({ notifyClaudeIdle: v })} />
                </SettingRow>
                <SettingRow title="Som ao terminar" desc="Toca um “ding” curto quando o Claude termina ou pede aprovação fora da aba ativa.">
                  <Toggle checked={settings.soundClaudeIdle} onChange={(v) => update({ soundClaudeIdle: v })} />
                </SettingRow>
              </>
            )}

            {active === 'devserver' && (
              <SettingRow title="Abrir o Browser automaticamente" desc="Quando o dev server expõe a URL, o painel troca para o Browser interno já navegando nela.">
                <Toggle checked={settings.autoOpenBrowserOnDev} onChange={(v) => update({ autoOpenBrowserOnDev: v })} />
              </SettingRow>
            )}

            {active === 'voice' && (
              <>
                <div className="rounded-xl border border-border-subtle bg-bg-base px-3.5 py-3 text-[11.5px] leading-relaxed text-text-tertiary">
                  Compatível com qualquer endpoint OpenAI/Whisper. <span className="font-medium text-accent">Groq tem free tier generoso</span> em <code className="text-text-secondary">api.groq.com/openai/v1</code> — crie uma chave em <code className="text-text-secondary">console.groq.com</code>.
                </div>
                <Field label="API key">
                  <Input type="password" value={settings.whisperApiKey ?? ''} onChange={(v) => update({ whisperApiKey: v || null })} placeholder="gsk_…" />
                </Field>
                <Field label="Endpoint base">
                  <Input value={settings.whisperApiBase} onChange={(v) => update({ whisperApiBase: v })} placeholder="https://api.groq.com/openai/v1" />
                </Field>
                <Field label="Modelo">
                  <Input value={settings.whisperModel} onChange={(v) => update({ whisperModel: v })} placeholder="whisper-large-v3-turbo  ou  whisper-1" />
                </Field>
              </>
            )}

            {active === 'about' && <AboutPanel />}
            {active === 'remote' && <RemotePanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutPanel() {
  const appVersion = useUpdateStore((s) => s.appVersion);
  const status = useUpdateStore((s) => s.status);
  const check = useUpdateStore((s) => s.check);
  const install = useUpdateStore((s) => s.install);
  const simulate = useUpdateStore((s) => s.simulate);
  const [checking, setChecking] = useState(false);

  const label =
    status.state === 'checking' ? 'Verificando…'
      : status.state === 'downloading' ? `Baixando atualização… ${status.percent ?? 0}%`
      : status.state === 'ready' ? `Atualização ${status.version ? `v${status.version}` : ''} pronta`
      : status.state === 'error' ? 'Não foi possível verificar agora'
      : checking ? 'Verificando…'
      : 'Você está na versão mais recente';

  const working = checking || status.state === 'checking' || status.state === 'downloading';

  function onCheck() {
    setChecking(true);
    check();
    setTimeout(() => setChecking(false), 2500);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3.5 rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: 'var(--accent-soft)' }}>⚡</span>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-tight text-text-primary">Voltz IDE</span>
          <span className="font-mono text-[11px] text-text-muted">{appVersion ? `v${appVersion}` : '—'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-base px-3.5 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[12.5px] font-medium text-text-primary">Atualizações</span>
          <span className="text-[11px] text-text-tertiary">{label}</span>
        </div>
        {status.state === 'ready' ? (
          <button onClick={install} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <RefreshCw size={12} /> Reiniciar para atualizar
          </button>
        ) : (
          <button onClick={onCheck} disabled={working} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-50">
            <RefreshCw size={12} className={working ? 'animate-spin' : ''} /> Verificar
          </button>
        )}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-text-muted">O app verifica sozinho ao abrir e a cada 6h. Aqui você pode forçar uma checagem.</p>
      {import.meta.env.DEV && (
        <button onClick={simulate} className="px-1 text-[10px] text-text-muted underline-offset-2 hover:text-accent hover:underline">
          Pré-visualizar banner (dev)
        </button>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--bg-active)' }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all"
        style={{ left: checked ? 19 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
      />
    </button>
  );
}

function SettingRow({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-base px-3.5 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">{title}</span>
        {desc && <span className="text-[11px] leading-relaxed text-text-tertiary">{desc}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-text-muted">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-primary outline-none transition-colors focus:border-accent"
    />
  );
}

function TerminalThemePicker({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {TERMINAL_THEME_GROUPS.map((group) => {
        const items = TERMINAL_THEMES.filter((t) => t.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{group.label}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((t) => {
                const activeT = current === t.id;
                const [bg, fg, ac] = t.preview;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className="group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors"
                    style={{ background: activeT ? 'var(--bg-active)' : 'var(--bg-base)', borderColor: activeT ? 'var(--accent)' : 'var(--border-subtle)' }}
                  >
                    <span className="flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle text-[10px] font-bold" style={{ background: bg, color: fg }} title={t.id}>
                      <span className="opacity-80">&gt;_</span>
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: ac }} />
                    </span>
                    <span className="flex-1 truncate text-[11.5px] font-medium text-text-primary">{t.label}</span>
                    {activeT && <Check size={13} className="shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThemeOption({ mode, current, onSelect, icon, label, preview }: {
  mode: ThemeMode; current: ThemeMode; onSelect: (m: ThemeMode) => void; icon: React.ReactNode; label: string; preview: [string, string];
}) {
  const on = mode === current;
  return (
    <button
      onClick={() => onSelect(mode)}
      className="flex flex-col items-center gap-2.5 rounded-xl border p-3 transition-all"
      style={{ background: on ? 'var(--accent-soft)' : 'var(--bg-base)', borderColor: on ? 'var(--accent)' : 'var(--border-subtle)' }}
    >
      <span className="flex h-12 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg" style={{ background: preview[0] }}>
        <span style={{ color: preview[1] }}>{icon}</span>
      </span>
      <span className="text-[12px] font-semibold" style={{ color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>{label}</span>
    </button>
  );
}

const ACT_ICON: Record<string, string> = { prompt: '📤', approval: '🔐', approved: '✅', denied: '❌', response: '💬', info: '📡' };
const ACT_LABEL: Record<string, string> = { prompt: 'pedido', approval: 'aprovação pedida', approved: 'aprovado', denied: 'negado', response: 'resposta', info: '' };
function fmtRel(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d}d`;
  try { return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return ''; }
}
function fmtDateTime(ts: number): string {
  try {
    const dt = new Date(ts);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return dt.getTime() >= start.getTime() ? time : `${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
  } catch { return ''; }
}

/** Histórico remoto persistente, agrupado por projeto (acordeão). */
function RemoteHistory() {
  const history = useRemoteStore((s) => s.history);
  const clearHistory = useRemoteStore((s) => s.clearHistory);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const map = new Map<string, RemoteActivity[]>();
    for (const e of history) {
      const key = e.project || 'Geral';
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()]
      .map(([project, events]) => ({
        project,
        events,
        last: events.reduce((m, e) => Math.max(m, e.ts), 0),
        prompts: events.filter((e) => e.kind === 'prompt').length,
      }))
      .sort((a, b) => b.last - a.last);
  }, [history]);

  if (!history.length) {
    return (
      <div>
        <label className="mb-1.5 block text-[11.5px] font-medium text-text-secondary">Histórico remoto</label>
        <p className="rounded-xl border border-border-subtle bg-bg-base px-3 py-4 text-center text-[11px] text-text-muted">
          Nada ainda. Pedidos, respostas e previews feitos pelo Telegram ficam guardados aqui, por projeto.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11.5px] font-medium text-text-secondary">Histórico remoto</label>
        <button onClick={() => void clearHistory()} className="flex items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-danger">
          <Trash2 size={11} /> Limpar tudo
        </button>
      </div>
      <div className="space-y-1.5">
        {groups.map((g, gi) => {
          const isOpen = open[g.project] ?? gi === 0; // primeiro grupo aberto por padrão
          return (
            <div key={g.project} className="overflow-hidden rounded-xl border border-border-subtle bg-bg-base">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.project]: !isOpen }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <ChevronDown size={13} className={`shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-secondary">{g.project}</span>
                <span className="shrink-0 rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] text-text-tertiary">{g.prompts} {g.prompts === 1 ? 'pedido' : 'pedidos'}</span>
                <span className="shrink-0 text-[10px] text-text-muted">{fmtRel(g.last)}</span>
              </button>
              {isOpen && (
                <div className="max-h-60 space-y-px overflow-y-auto border-t border-border-subtle px-2 py-1.5">
                  {g.events.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 px-1 py-1 text-[11px] leading-4">
                      <span className="shrink-0">{ACT_ICON[e.kind]}</span>
                      <span className="w-[78px] shrink-0 font-mono text-[9.5px] text-text-muted">{fmtDateTime(e.ts)}</span>
                      <span className={`min-w-0 flex-1 break-words ${e.kind === 'prompt' ? 'font-medium text-text-secondary' : 'text-text-tertiary'}`}>
                        {(e.text || ACT_LABEL[e.kind]).slice(0, 300)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RemotePanel() {
  const { status, projectsEnabled, init, refresh, setProjectEnabled } = useRemoteStore();
  const projects = useProjectsStore((s) => s.projects);
  const customs = useProjectCustomStore((s) => s.customs);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [projSearch, setProjSearch] = useState('');

  useEffect(() => { const off = init(); return off; }, [init]);

  async function saveToken() {
    setSaving(true); setResult(null);
    try {
      const r = await window.api.remote.setToken(token.trim() || null);
      if (!r.ok) {
        setResult({ ok: false, msg: r.error || 'Não consegui conectar ao bot.' });
        toast.error('Falha ao conectar', r.error);
      } else {
        await window.api.remote.setEnabled(true);
        await refresh();
        setResult({ ok: true, msg: r.botUsername ? `Conectado como @${r.botUsername}` : 'Bot conectado' });
        toast.success('Bot conectado', r.botUsername ? `@${r.botUsername}` : undefined);
      }
    } catch (e) {
      setResult({ ok: false, msg: String((e as Error)?.message ?? e) });
    } finally {
      setSaving(false);
    }
  }
  async function pair() { const code = await window.api.remote.generatePairingCode(); await refresh(); toast.info('Código de pareamento', `Envie no Telegram: /pair ${code}`); }
  async function toggleProject(path: string, on: boolean) { await setProjectEnabled(path, on); }

  const q = projSearch.trim().toLowerCase();
  const enabledSet = new Set(projectsEnabled);
  const shownProjects = (q
    ? projects.filter((p) => (selectCustom(customs, p.path).alias || p.name).toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
    : projects.filter((p) => enabledSet.has(p.path)));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-subtle bg-bg-base px-3.5 py-3 text-[11.5px] leading-relaxed text-text-tertiary">
        Crie um bot no Telegram com <span className="font-medium text-text-secondary">@BotFather</span> → <code className="text-text-secondary">/newbot</code> → cole o token aqui.
      </div>
      <Field label="Token do bot">
        <div className="flex gap-2">
          <Input type="password" value={token} onChange={setToken} placeholder="123456:ABC-…" />
          <button onClick={() => void saveToken()} disabled={saving} className="shrink-0 rounded-lg px-3 text-[12px] font-semibold transition-opacity disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {saving ? 'Verificando…' : 'Salvar'}
          </button>
        </div>
        {result && (
          <p className="mt-1.5 text-[11px] font-medium" style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }}>
            {result.ok ? '✓ ' : '✗ '}{result.msg}
          </p>
        )}
      </Field>
      <SettingRow title="Status" desc={status.error ?? (status.botUsername ? `Conectado como @${status.botUsername}` : 'Sem bot configurado')}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.running ? 'var(--success)' : 'var(--text-disabled)' }} />
      </SettingRow>
      <SettingRow title="Pareamento" desc={status.paired ? 'Pareado com seu celular ✓' : (status.pairingCode ? `Envie no bot: /pair ${status.pairingCode}` : 'Não pareado')}>
        {status.paired
          ? <button onClick={() => { void window.api.remote.unpair().then(refresh); }} className="rounded-lg border border-border-subtle px-2.5 py-1 text-[11px] text-text-secondary hover:border-danger hover:text-danger">Desparear</button>
          : <button onClick={() => void pair()} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Gerar código</button>}
      </SettingRow>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[11.5px] font-medium text-text-secondary">Projetos com acesso remoto</label>
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-text-tertiary">
            {projectsEnabled.length} liberado{projectsEnabled.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="relative mb-2">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={projSearch}
            onChange={(e) => setProjSearch(e.target.value)}
            placeholder="Buscar projeto para liberar…"
            className="w-full rounded-lg border border-border-subtle bg-bg-base py-2 pl-8 pr-8 text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent"
          />
          {projSearch && (
            <button onClick={() => setProjSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary" title="Limpar busca">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {shownProjects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-subtle bg-bg-base px-3 py-3.5 text-center text-[11px] text-text-muted">
              {q ? 'Nenhum projeto encontrado com esse nome.' : 'Nenhum projeto liberado ainda. Use a busca acima para encontrar e ativar um projeto.'}
            </p>
          ) : shownProjects.map((p) => {
            const on = enabledSet.has(p.path);
            const name = selectCustom(customs, p.path).alias || p.name;
            return (
              <SettingRow key={p.id} title={name} desc={on ? 'Acessível pelo Telegram' : 'Tocar para liberar'}>
                <Toggle checked={on} onChange={(v) => void toggleProject(p.path, v)} />
              </SettingRow>
            );
          })}
        </div>
        {!q && projectsEnabled.length > 0 && (
          <p className="mt-1.5 text-[10.5px] text-text-muted">Mostrando só os liberados. Busque acima para adicionar outros.</p>
        )}
      </div>

      <RemoteHistory />
    </div>
  );
}
