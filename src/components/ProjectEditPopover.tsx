import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Star, X, RotateCcw, Plus, Check } from 'lucide-react';
import { useProjectCustomStore, selectCustom } from '@/stores/projectCustom';
import { PROJECT_PALETTE } from '@/lib/projectColors';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Dev & Tech', emojis: ['🚀','⚡','🔥','💎','🛠️','🤖','📦','🌐','🔐','📊','💡','🧩','⚙️','🖥️','💻','📱','🔌','🧰','🔧','🧱','🗄️','🛰️','📡','🔋','🧠','🐳','🧪','⌨️'] },
  { label: 'Design & Arte', emojis: ['🎨','✨','🌈','🖌️','🖼️','📐','🎭','🪄','🌟','💫','🔮','🧿','🎬','🎥','📷','🪅','🎼','🎸'] },
  { label: 'Natureza', emojis: ['🌊','🌿','🍃','🌱','🌳','🌵','🌸','🌻','🌙','⭐','☀️','❄️','🍀','🦋','🐙','🦊','🐢','🐝','🦄','🐬','🐼','🦉','🌴','🔥'] },
  { label: 'Objetos', emojis: ['🏠','🛒','💼','📁','📂','📌','📎','✏️','📝','🔖','🏷️','🔑','🗝️','🎁','🔭','🔬','⚗️','🧬','📚','🗂️','💾','🧾','🔔','💰'] },
  { label: 'Símbolos', emojis: ['✅','⭐','🔴','🟢','🟡','🔵','🟣','⚪','🟠','❤️','🧡','💛','💚','💙','💜','🖤','🤍','♻️','⚠️','🚦','♾️','✔️'] },
  { label: 'Diversão', emojis: ['😀','😎','🤓','🥳','👀','🙌','👍','💪','🎯','🏆','🥇','🎉','🧨','👾','🕹️','🎮','🎲','🪙','🦾','🫡'] },
];

interface Props {
  projectPath: string;
  projectName: string;
  anchor: HTMLElement;
  onClose: () => void;
}

export function ProjectEditPopover({ projectPath, projectName, anchor, onClose }: Props) {
  const custom = useProjectCustomStore((s) => selectCustom(s.customs, projectPath));
  const update = useProjectCustomStore((s) => s.update);
  const toggleFav = useProjectCustomStore((s) => s.toggleFavorite);

  const [alias, setAlias] = useState(custom.alias ?? '');
  const [emoji, setEmoji] = useState(custom.emoji ?? '');
  const [color, setColor] = useState(custom.color ?? '');
  const [emojiInput, setEmojiInput] = useState(custom.emoji ?? '');

  const ref = useRef<HTMLDivElement>(null);

  // Position below/beside anchor — useLayoutEffect calcula ANTES da pintura,
  // evitando o "pulo" do canto (0,0) para o lugar certo.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const winW = window.innerWidth;
    const popW = 260;
    let left = r.right + 6;
    if (left + popW > winW) left = r.left - popW - 6;
    setPos({ top: r.top, left: Math.max(4, left) });
  }, [anchor]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        onClose();
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onClick), 50);
    return () => document.removeEventListener('mousedown', onClick);
  }, [anchor, onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    await update(projectPath, {
      alias: alias.trim() || undefined,
      emoji: emoji || undefined,
      color: color || undefined,
    });
    onClose();
  }

  function pickEmoji(e: string) {
    setEmoji(e);
    setEmojiInput(e);
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[200] flex flex-col gap-3 rounded-xl border border-border-default bg-bg-overlay p-4 shadow-lg"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: 260, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          {custom.alias || projectName}
        </span>
        <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          <X size={12} />
        </button>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Emoji / Ícone
        </label>
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-active text-lg">
            {emoji || '📁'}
          </div>
          <input
            value={emojiInput}
            onChange={(e) => { setEmojiInput(e.target.value); setEmoji(e.target.value); }}
            placeholder="Cole um emoji…"
            className="flex-1 rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            maxLength={4}
          />
          {emoji && (
            <button onClick={() => { setEmoji(''); setEmojiInput(''); }}
              className="text-text-muted hover:text-text-primary">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border-subtle bg-bg-base/40 p-1.5">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-0.5 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">{g.label}</div>
              <div className="flex flex-wrap gap-0.5">
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    onClick={() => pickEmoji(e)}
                    className="flex h-6 w-6 items-center justify-center rounded text-base transition-transform hover:scale-125"
                    style={{ background: emoji === e ? 'var(--accent-strong)' : undefined }}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Apelido (somente no app)
        </label>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder={projectName}
          className="w-full rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Cor</label>
            {color && <span className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />}
          </div>
          {color && (
            <button
              onClick={() => setColor('')}
              className="flex items-center gap-1 text-[10px] text-text-muted transition-colors hover:text-text-primary"
              title="Usar cor automática (hash do nome)"
            >
              <RotateCcw size={10} />
              auto
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {PROJECT_PALETTE.map((p) => {
            const selected = color === p.border;
            return (
              <button
                key={p.id}
                onClick={() => setColor(selected ? '' : p.border)}
                className="flex h-7 items-center justify-center rounded-lg transition-transform hover:scale-[1.14]"
                style={{
                  background: p.border,
                  boxShadow: selected
                    ? `0 0 0 2px var(--bg-overlay), 0 0 0 4px ${p.border}, 0 2px 8px -2px ${p.border}`
                    : 'inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
                title={p.label}
              >
                {selected && <Check size={14} className="text-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.55))' }} />}
              </button>
            );
          })}
          {/* Color picker livre */}
          <label
            className="relative flex h-7 cursor-pointer items-center justify-center rounded-lg transition-transform hover:scale-[1.1]"
            style={{ background: 'conic-gradient(from 0deg, #ef6f64, #f0903e, #e0c04e, #5dc878, #4bb5cf, #6571ec, #b07be0, #e060d0, #ef6f64)' }}
            title="Cor personalizada (escolher qualquer cor)"
          >
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#7c6bff'}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <Plus size={13} className="text-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.55))' }} />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-2">
        <button
          onClick={() => { void toggleFav(projectPath); }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors"
          style={{
            background: custom.favorite ? 'var(--warning-soft)' : 'var(--bg-active)',
            color: custom.favorite ? 'var(--warning)' : 'var(--text-tertiary)',
            border: `1px solid ${custom.favorite ? 'color-mix(in srgb, var(--warning) 35%, transparent)' : 'transparent'}`,
          }}
        >
          <Star size={12} fill={custom.favorite ? 'currentColor' : 'none'} />
          {custom.favorite ? 'Favorito' : 'Favoritar'}
        </button>
        <button
          onClick={() => void save()}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
