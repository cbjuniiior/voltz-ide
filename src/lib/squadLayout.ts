import type { CanvasRect } from '@shared/types';
import { PERSONAS, MAESTRO_ID } from '@/lib/personaCatalog';

/**
 * Layout radial fixo do Canvas do Esquadrão: Maestro no centro, especialistas
 * em volta. Usado tanto pelo store (posição do terminal ao ativar) quanto pelo
 * overlay (placeholders "aguardando"), para alinharem.
 */
export const SQUAD_CW = 360;
export const SQUAD_CH = 236;
const CX = 820;
const CY = 600;
const R = 520;

/** Rect (world coords) do "slot" de uma persona no canvas. */
export function squadSlot(personaId: string): CanvasRect {
  if (personaId === MAESTRO_ID) {
    return { x: CX - SQUAD_CW / 2, y: CY - SQUAD_CH / 2, w: SQUAD_CW, h: SQUAD_CH };
  }
  const specialists = PERSONAS.filter((p) => p.id !== MAESTRO_ID);
  const i = Math.max(0, specialists.findIndex((p) => p.id === personaId));
  const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / specialists.length;
  return { x: CX + R * Math.cos(ang) - SQUAD_CW / 2, y: CY + R * Math.sin(ang) - SQUAD_CH / 2, w: SQUAD_CW, h: SQUAD_CH };
}

/** Centro (world coords) do slot de uma persona. */
export function squadSlotCenter(personaId: string): { x: number; y: number } {
  const r = squadSlot(personaId);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Caixa que envolve todos os 9 slots (para enquadrar o canvas). */
export function squadBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const rects = PERSONAS.map((p) => squadSlot(p.id));
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.w)),
    maxY: Math.max(...rects.map((r) => r.y + r.h)),
  };
}
