// Motor do "Modo Editor" do navegador interno: um script injetado no <webview>
// que deixa selecionar elementos, editar estilos/texto ao vivo e exportar as
// edições (seletor → propriedades) para virar CSS salvo no projeto.

export interface EditEntry { styles?: Record<string, string>; text?: string }
export type EditMap = Record<string, EditEntry>;

export interface SelectionInfo {
  selector: string;
  tag: string;
  /** texto do elemento se ele for "folha" (sem filhos elemento); senão null. */
  text: string | null;
  styles: Record<string, string>;
}

/** Propriedades editáveis pelo painel (camelCase = chave em element.style). */
export const EDIT_PROPS = [
  'color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontFamily', 'textAlign',
  'lineHeight', 'letterSpacing', 'borderRadius', 'borderWidth', 'borderStyle', 'borderColor',
  'padding', 'margin', 'boxShadow', 'display', 'opacity',
] as const;

const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

// ---- Google Fonts (curadoria das melhores/mais usadas) ----
export interface GFont { name: string; cat: 'sans' | 'serif' | 'mono' | 'display' }
export const GOOGLE_FONTS: GFont[] = [
  { name: 'Inter', cat: 'sans' }, { name: 'Roboto', cat: 'sans' }, { name: 'Open Sans', cat: 'sans' },
  { name: 'Montserrat', cat: 'sans' }, { name: 'Poppins', cat: 'sans' }, { name: 'Lato', cat: 'sans' },
  { name: 'Manrope', cat: 'sans' }, { name: 'Nunito', cat: 'sans' }, { name: 'Raleway', cat: 'sans' },
  { name: 'Work Sans', cat: 'sans' }, { name: 'DM Sans', cat: 'sans' }, { name: 'Space Grotesk', cat: 'sans' },
  { name: 'Plus Jakarta Sans', cat: 'sans' }, { name: 'Figtree', cat: 'sans' }, { name: 'Outfit', cat: 'sans' },
  { name: 'Sora', cat: 'sans' }, { name: 'Albert Sans', cat: 'sans' },
  { name: 'Playfair Display', cat: 'serif' }, { name: 'Merriweather', cat: 'serif' }, { name: 'Lora', cat: 'serif' },
  { name: 'JetBrains Mono', cat: 'mono' }, { name: 'Fira Code', cat: 'mono' },
  { name: 'Oswald', cat: 'display' }, { name: 'Bebas Neue', cat: 'display' },
];
const FALLBACK: Record<GFont['cat'], string> = { sans: 'sans-serif', serif: 'serif', mono: 'monospace', display: 'sans-serif' };
const GFONT_NAMES = new Set(GOOGLE_FONTS.map((f) => f.name));

export function fontStack(f: GFont): string { return `'${f.name}', ${FALLBACK[f.cat]}`; }
export function googleFontHref(name: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@300;400;500;600;700;800&display=swap`;
}
/** Nome da fonte (1ª da pilha) se for um Google Font conhecido; senão null. */
function gfontOf(fontFamily?: string): string | null {
  if (!fontFamily) return null;
  const first = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  return GFONT_NAMES.has(first) ? first : null;
}
function usedGoogleFonts(map: EditMap): string[] {
  const set = new Set<string>();
  for (const e of Object.values(map)) { const n = gfontOf(e.styles?.fontFamily); if (n) set.add(n); }
  return [...set];
}

/** Gera o CSS (apenas estilos; texto não vai pra CSS) a partir do mapa de edições. */
export function cssFromEdits(map: EditMap): string {
  const imports = usedGoogleFonts(map).map((n) => `@import url('${googleFontHref(n)}');`);
  const blocks: string[] = ['/* Gerado pelo Modo Editor do Voltz IDE — reaplicado automaticamente. */'];
  for (const [selector, entry] of Object.entries(map)) {
    const styles = entry.styles;
    if (!styles || !Object.keys(styles).length) continue;
    const decls = Object.entries(styles)
      .map(([prop, val]) => `  ${camelToKebab(prop)}: ${val} !important;`)
      .join('\n');
    blocks.push(`${selector} {\n${decls}\n}`);
  }
  return [...imports, ...(imports.length ? [''] : []), ...blocks].join('\n\n') + '\n';
}

function loadFontJs(href: string): string {
  return `(function(h){try{if([].some.call(document.querySelectorAll('link[rel=stylesheet]'),function(l){return l.href===h;}))return;var l=document.createElement('link');l.rel='stylesheet';l.href=h;document.head.appendChild(l);}catch(_){}})(${JSON.stringify(href)});`;
}
/** JS para carregar uma Google Font ao vivo (ao escolher no painel). */
export function loadFontScript(name: string): string { return loadFontJs(googleFontHref(name)); }

/** Script leve que REAPLICA edições salvas (sem entrar no modo editor) + carrega fontes. */
export function applySavedScript(map: EditMap): string {
  const fontLinks = usedGoogleFonts(map).map((n) => loadFontJs(googleFontHref(n))).join('');
  return fontLinks
    + `(function(m){try{Object.keys(m).forEach(function(s){var el=document.querySelector(s);if(!el)return;var e=m[s];`
    + `if(e.styles)Object.keys(e.styles).forEach(function(p){try{el.style.setProperty(p.replace(/[A-Z]/g,function(x){return '-'+x.toLowerCase();}),e.styles[p]);}catch(_){el.style[p]=e.styles[p];}});`
    + `if(typeof e.text==='string')el.textContent=e.text;});}catch(_){}})(${JSON.stringify(map)})`;
}

/** Script injetado na página (IIFE). Cria window.__voltzEdit. */
export const EDITOR_SCRIPT = String.raw`(function(){
  if (window.__voltzEdit) { window.__voltzEdit.activate(); return; }
  var ACCENT = '#7c6bff';
  var sel = null, hoverEl = null, edits = {};

  function esc(s){ try { return CSS.escape(s); } catch(_) { return s; } }
  function cssPath(el){
    if (!el || el.nodeType!==1) return '';
    if (el.id) return '#'+esc(el.id);
    var parts = [], cur = el;
    while (cur && cur.nodeType===1 && cur.tagName.toLowerCase()!=='html' && cur.tagName.toLowerCase()!=='body'){
      if (cur.id){ parts.unshift('#'+esc(cur.id)); break; }
      var tag = cur.tagName.toLowerCase(), p = cur.parentElement;
      if (p){
        var same = Array.prototype.filter.call(p.children, function(c){ return c.tagName===cur.tagName; });
        if (same.length>1){ tag += ':nth-of-type('+(same.indexOf(cur)+1)+')'; }
      }
      parts.unshift(tag);
      cur = p;
    }
    return parts.join(' > ');
  }
  var KEYS = ['color','backgroundColor','fontSize','fontWeight','fontFamily','textAlign','lineHeight','letterSpacing','borderRadius','borderWidth','borderStyle','borderColor','padding','margin','boxShadow','display','opacity'];
  function pickStyles(el){ var cs=getComputedStyle(el), o={}; KEYS.forEach(function(k){ o[k]=cs[k]; }); return o; }
  function outline(el,c){ if(el){ el.style.setProperty('outline','2px solid '+c,'important'); el.style.setProperty('outline-offset','1px','important'); } }
  function clearOutline(el){ if(el){ el.style.removeProperty('outline'); el.style.removeProperty('outline-offset'); } }

  function report(){
    if(!sel) return;
    var info = { selector: cssPath(sel), tag: sel.tagName.toLowerCase(), text: (sel.children.length===0 ? (sel.textContent||'') : null), styles: pickStyles(sel) };
    try { console.log('VOLTZ_SEL:'+JSON.stringify(info)); } catch(_){}
  }
  function onOver(e){ if(e.target===sel) return; clearOutline(hoverEl); hoverEl=e.target; if(hoverEl!==sel) outline(hoverEl,'rgba(124,107,255,.45)'); }
  function onOut(e){ if(e.target!==sel) clearOutline(e.target); }
  function onClick(e){ e.preventDefault(); e.stopPropagation(); clearOutline(sel); clearOutline(hoverEl); sel=e.target; outline(sel,ACCENT); report(); return false; }

  function entry(s){ edits[s]=edits[s]||{styles:{}}; if(!edits[s].styles) edits[s].styles={}; return edits[s]; }

  window.__voltzEdit = {
    active:false,
    activate:function(){ if(this.active)return; this.active=true;
      document.addEventListener('mouseover',onOver,true);
      document.addEventListener('mouseout',onOut,true);
      document.addEventListener('click',onClick,true); },
    deactivate:function(){ this.active=false;
      document.removeEventListener('mouseover',onOver,true);
      document.removeEventListener('mouseout',onOut,true);
      document.removeEventListener('click',onClick,true);
      clearOutline(sel); clearOutline(hoverEl); sel=null; hoverEl=null; },
    apply:function(prop,val){ if(!sel)return; try{ sel.style.setProperty(prop.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase();}), val); }catch(_){ sel.style[prop]=val; } entry(cssPath(sel)).styles[prop]=val; },
    setText:function(t){ if(!sel)return; sel.textContent=t; entry(cssPath(sel)).text=t; },
    dump:function(){ return edits; },
    load:function(map){ edits = map||{}; },
    applySaved:function(map){ try{ Object.keys(map||{}).forEach(function(s){ var el=document.querySelector(s); if(!el)return; var e=map[s];
      if(e.styles) Object.keys(e.styles).forEach(function(p){ try{ el.style.setProperty(p.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase();}), e.styles[p]); }catch(_){ el.style[p]=e.styles[p]; } });
      if(typeof e.text==='string') el.textContent=e.text;
    }); }catch(_){} },
  };
  window.__voltzEdit.activate();
})();`;
