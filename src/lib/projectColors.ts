// Curated warm palette — muted, sophisticated. Each entry harmonises with the
// warm graphite app background. No neon, no harsh saturation.
// Paleta fria/moderna (harmoniza com o accent índigo). bg = tons escuros frios
// para o tema escuro; em superfícies claras, prefira `pillStyle()` (theme-aware).
export const PROJECT_PALETTE = [
  { id: 'indigo',  label: 'Índigo',    bg: '#1d2030', border: '#7c89f0', text: '#a8b1f5', badge: '#6571ec' },
  { id: 'blue',    label: 'Azul',      bg: '#15212f', border: '#5b9bd5', text: '#8fbce4', badge: '#5b9bd5' },
  { id: 'sky',     label: 'Céu',       bg: '#152330', border: '#5aa9e6', text: '#8fc6ef', badge: '#5aa9e6' },
  { id: 'cyan',    label: 'Ciano',     bg: '#13252b', border: '#4bb5cf', text: '#7fcfe2', badge: '#4bb5cf' },
  { id: 'teal',    label: 'Teal',      bg: '#132723', border: '#3fb8a0', text: '#74cdbb', badge: '#3fb8a0' },
  { id: 'emerald', label: 'Esmeralda', bg: '#152a20', border: '#46b87c', text: '#7cd0a0', badge: '#46b87c' },
  { id: 'violet',  label: 'Violeta',   bg: '#231f33', border: '#9b87f0', text: '#bbabf5', badge: '#8b7ff0' },
  { id: 'purple',  label: 'Roxo',      bg: '#271d31', border: '#b07be0', text: '#c9a4ec', badge: '#a472e0' },
  { id: 'pink',    label: 'Rosa',      bg: '#2e1d2a', border: '#d873c0', text: '#e5a3d4', badge: '#d873c0' },
  { id: 'rose',    label: 'Coral',     bg: '#2e1d22', border: '#e0708f', text: '#eca3b4', badge: '#e0708f' },
  { id: 'amber',   label: 'Âmbar',     bg: '#2a2417', border: '#e0a64e', text: '#ecc488', badge: '#e0a64e' },
  { id: 'slate',   label: 'Ardósia',   bg: '#1d2026', border: '#8a93a6', text: '#aab1bf', badge: '#8a93a6' },
  { id: 'orange',  label: 'Laranja',   bg: '#2a1f15', border: '#f0903e', text: '#f5b780', badge: '#f0903e' },
  { id: 'red',     label: 'Vermelho',  bg: '#2e1a1a', border: '#ef6f64', text: '#f3a098', badge: '#ef6f64' },
  { id: 'lime',    label: 'Lima',      bg: '#212611', border: '#a8cf4b', text: '#c7e283', badge: '#a8cf4b' },
  { id: 'green',   label: 'Verde',     bg: '#152611', border: '#5dc878', text: '#92dba8', badge: '#5dc878' },
  { id: 'mint',    label: 'Menta',     bg: '#102621', border: '#4bcf9e', text: '#83e2c0', badge: '#4bcf9e' },
  { id: 'fuchsia', label: 'Fúcsia',    bg: '#2a1528', border: '#e060d0', text: '#eca0e0', badge: '#e060d0' },
  { id: 'gold',    label: 'Dourado',   bg: '#2a2515', border: '#e0c04e', text: '#ecd488', badge: '#e0c04e' },
  { id: 'plum',    label: 'Ameixa',    bg: '#241530', border: '#b06be0', text: '#cca4ec', badge: '#b06be0' },
] as const;

export type ProjectColorId = (typeof PROJECT_PALETTE)[number]['id'];
export type ProjectColor   = (typeof PROJECT_PALETTE)[number];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getProjectColor(name: string): ProjectColor {
  return PROJECT_PALETTE[hashString(name) % PROJECT_PALETTE.length];
}

export function getProjectColorById(id: ProjectColorId | string | null | undefined): ProjectColor | null {
  if (!id) return null;
  return PROJECT_PALETTE.find((p) => p.id === id) ?? null;
}
