/**
 * Lightweight subsequence fuzzy match.
 * Returns null when the query doesn't match, or a score + match positions for highlighting.
 * Higher score = better match. Consecutive characters and start-of-word boost the score.
 */

export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (q.length > t.length) return null;

  const positions: number[] = [];
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      positions.push(ti);
      // Bonuses
      let bonus = 1;
      if (ti === 0) bonus += 4;
      const prev = ti > 0 ? t[ti - 1] : '';
      if (prev === ' ' || prev === '/' || prev === '\\' || prev === '-' || prev === '_' || prev === '.') {
        bonus += 3; // start-of-word
      }
      if (lastMatchIdx === ti - 1) {
        consecutive++;
        bonus += consecutive * 2;
      } else {
        consecutive = 0;
      }
      score += bonus;
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return null;
  // Prefer shorter strings for ties
  score -= t.length * 0.01;
  return { score, positions };
}

export function highlightMatches(text: string, positions: number[]): React.ReactNode[] {
  if (positions.length === 0) return [text];
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const pos of positions) {
    if (pos > cursor) parts.push(text.slice(cursor, pos));
    parts.push(
      // eslint-disable-next-line react/no-array-index-key
      <mark key={pos} className="bg-transparent font-bold text-accent">
        {text[pos]}
      </mark>,
    );
    cursor = pos + 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
