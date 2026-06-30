import { useEffect, useId, useState } from 'react';
import { X, Save, MousePointer2, Type, Palette, Square, Layout, Loader2 } from 'lucide-react';
import { GOOGLE_FONTS, fontStack, type SelectionInfo, type GFont } from '@/lib/liveEditor';

interface Props {
  selection: SelectionInfo | null;
  accent: string;
  saving: boolean;
  onApply: (prop: string, value: string) => void;
  onText: (text: string) => void;
  /** Carregar uma Google Font ao vivo na página. */
  onLoadFont: (family: string) => void;
  onSave: () => void;
  onClose: () => void;
}

const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];
const ALIGNS = ['left', 'center', 'right', 'justify'];
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'];
const DISPLAYS = ['block', 'inline-block', 'flex', 'grid', 'inline', 'none'];
const SHADOWS: { label: string; value: string }[] = [
  { label: 'Nenhuma', value: 'none' },
  { label: 'Sutil', value: '0 1px 2px rgba(0,0,0,.08)' },
  { label: 'Suave', value: '0 2px 8px rgba(0,0,0,.10)' },
  { label: 'Média', value: '0 4px 12px rgba(0,0,0,.14)' },
  { label: 'Forte', value: '0 10px 30px rgba(0,0,0,.20)' },
  { label: 'Bem forte', value: '0 20px 50px rgba(0,0,0,.30)' },
  { label: 'Interna', value: 'inset 0 2px 6px rgba(0,0,0,.15)' },
];
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px', '48px', '64px'];
const LHS = ['1', '1.2', '1.4', '1.5', '1.6', '1.8', '2'];
const LSPS = ['-0.02em', '0', '0.02em', '0.04em', '0.08em'];
const BWS = ['0px', '1px', '2px', '3px', '4px'];
const RADII = ['0px', '4px', '8px', '12px', '16px', '24px', '9999px'];
const SPACES = ['0', '4px', '8px', '12px', '16px', '20px', '24px', '32px', '48px'];

/** Painel "Modo Editor": ajusta estilos/texto do elemento selecionado, ao vivo. */
export function LiveEditorPanel({ selection, accent, saving, onApply, onText, onLoadFont, onSave, onClose }: Props) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [text, setText] = useState('');

  useEffect(() => {
    setVals(selection?.styles ?? {});
    setText(selection?.text ?? '');
  }, [selection?.selector]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(prop: string, value: string) {
    setVals((v) => ({ ...v, [prop]: value }));
    onApply(prop, value);
  }

  return (
    <div
      className="absolute right-0 top-0 z-30 flex h-full w-72 flex-col border-l border-border-default bg-bg-surface shadow-xl"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3" style={{ background: `color-mix(in srgb, ${accent} 14%, var(--bg-surface))` }}>
        <MousePointer2 size={13} style={{ color: accent }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>Modo Editor</span>
        <button onClick={onSave} disabled={saving} title="Salvar no CSS do projeto" className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-opacity disabled:opacity-60" style={{ background: accent, color: 'var(--accent-fg)' }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
        </button>
        <button onClick={onClose} title="Sair do modo editor" className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"><X size={13} /></button>
      </div>

      {!selection ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MousePointer2 size={22} className="text-text-disabled" />
          <p className="text-[12px] text-text-tertiary">Clique em um elemento da página para editar.</p>
          <p className="text-[10.5px] text-text-muted">Texto, cores, fonte, bordas, espaçamento… aplicado ao vivo.</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <div className="rounded-md bg-bg-base px-2 py-1 font-mono text-[10px] text-text-muted" title={selection.selector}>
            &lt;{selection.tag}&gt; <span className="text-text-disabled">· {selection.selector}</span>
          </div>

          {selection.text !== null && (
            <Section icon={<Type size={11} />} label="Texto">
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); onText(e.target.value); }}
                rows={2}
                className="w-full resize-none rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent"
              />
            </Section>
          )}

          <Section icon={<Palette size={11} />} label="Tipografia">
            <Row label="Cor"><Color value={vals.color} onChange={(v) => set('color', v)} /></Row>
            <Row label="Tamanho"><TxtList value={vals.fontSize} list={SIZES} onChange={(v) => set('fontSize', v)} placeholder="16px" /></Row>
            <Row label="Peso"><Sel value={vals.fontWeight} options={WEIGHTS} onChange={(v) => set('fontWeight', v)} /></Row>
            <Row label="Fonte">
              <FontSelect
                value={GOOGLE_FONTS.find((f) => (vals.fontFamily || '').includes(f.name))?.name ?? ''}
                onPick={(name) => {
                  if (!name) { set('fontFamily', ''); return; }
                  const f = GOOGLE_FONTS.find((x) => x.name === name)!;
                  set('fontFamily', fontStack(f));
                  onLoadFont(name);
                }}
              />
            </Row>
            <Row label="Alinhar"><Seg value={vals.textAlign} options={ALIGNS} onChange={(v) => set('textAlign', v)} /></Row>
            <Row label="Entrelinha"><TxtList value={vals.lineHeight} list={LHS} onChange={(v) => set('lineHeight', v)} placeholder="1.5" /></Row>
            <Row label="Espaç. letra"><TxtList value={vals.letterSpacing} list={LSPS} onChange={(v) => set('letterSpacing', v)} placeholder="0" /></Row>
          </Section>

          <Section icon={<Square size={11} />} label="Fundo & Borda">
            <Row label="Fundo"><Color value={vals.backgroundColor} onChange={(v) => set('backgroundColor', v)} /></Row>
            <Row label="Borda px"><TxtList value={vals.borderWidth} list={BWS} onChange={(v) => set('borderWidth', v)} placeholder="1px" /></Row>
            <Row label="Estilo"><Sel value={vals.borderStyle} options={BORDER_STYLES} onChange={(v) => set('borderStyle', v)} /></Row>
            <Row label="Cor borda"><Color value={vals.borderColor} onChange={(v) => set('borderColor', v)} /></Row>
            <Row label="Raio"><TxtList value={vals.borderRadius} list={RADII} onChange={(v) => set('borderRadius', v)} placeholder="8px" /></Row>
            <Row label="Sombra"><LabeledSel value={vals.boxShadow} options={SHADOWS} onChange={(v) => set('boxShadow', v)} /></Row>
          </Section>

          <Section icon={<Layout size={11} />} label="Layout">
            <Row label="Padding"><TxtList value={vals.padding} list={SPACES} onChange={(v) => set('padding', v)} placeholder="8px 12px" /></Row>
            <Row label="Margin"><TxtList value={vals.margin} list={SPACES} onChange={(v) => set('margin', v)} placeholder="0" /></Row>
            <Row label="Display"><Sel value={vals.display} options={DISPLAYS} onChange={(v) => set('display', v)} /></Row>
            <Row label="Opacidade">
              <input type="range" min={0} max={1} step={0.05} value={parseFloat(vals.opacity || '1')} onChange={(e) => set('opacity', e.target.value)} className="w-full accent-[var(--accent)]" />
            </Row>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base/40 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-text-muted">{icon}{label}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 text-[10.5px] text-text-tertiary">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
/** Input com sugestões (datalist): você escolhe uma opção OU digita o seu. */
function TxtList({ value, list, onChange, placeholder }: { value?: string; list: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <>
      <input list={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent" spellCheck={false} />
      <datalist id={id}>{list.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

/** Select com rótulos amigáveis → valores (ex.: presets de sombra). */
function LabeledSel({ value, options, onChange }: { value?: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  const matched = options.find((o) => o.value === (value ?? ''));
  return (
    <select
      value={matched ? matched.value : '__custom'}
      onChange={(e) => { if (e.target.value !== '__custom') onChange(e.target.value); }}
      className="w-full rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent"
    >
      {!matched && <option value="__custom">Personalizado…</option>}
      {options.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Select de Google Fonts agrupado por categoria. */
function FontSelect({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  const cats: { id: GFont['cat']; label: string }[] = [
    { id: 'sans', label: 'Sans-serif' }, { id: 'serif', label: 'Serifada' }, { id: 'display', label: 'Display' }, { id: 'mono', label: 'Monoespaçada' },
  ];
  return (
    <select value={value} onChange={(e) => onPick(e.target.value)} className="w-full rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent">
      <option value="">Sistema (padrão)</option>
      {cats.map((c) => (
        <optgroup key={c.id} label={c.label}>
          {GOOGLE_FONTS.filter((f) => f.cat === c.id).map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
function Sel({ value, options, onChange }: { value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent">
      <option value=""></option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Seg({ value, options, onChange }: { value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-0.5">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className="flex-1 rounded px-1 py-0.5 text-[9.5px] capitalize transition-colors" style={value === o ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { background: 'var(--bg-base)', color: 'var(--text-muted)' }}>{o.slice(0, 4)}</button>
      ))}
    </div>
  );
}
function Color({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="h-5 w-6 shrink-0 cursor-pointer rounded border border-border-subtle bg-transparent p-0" />
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="#000 / rgb()" className="min-w-0 flex-1 rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent" spellCheck={false} />
    </div>
  );
}
function toHex(v?: string): string {
  if (!v) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return '#000000';
}
