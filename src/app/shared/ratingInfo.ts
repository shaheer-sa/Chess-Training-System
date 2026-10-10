import type { MoveRating } from '../analysis/review.js';

/** How each move rating is shown: name, the standard annotation mark, colours (text contrast ≥ 4.5:1). */
export const RATING_INFO: Record<MoveRating, { text: string; glyph: string; color: string; textColor: string }> = {
  brilliant: { text: 'Brilliant', glyph: '!!', color: '#00796b', textColor: '#ffffff' },
  great: { text: 'Great', glyph: '!', color: '#3949ab', textColor: '#ffffff' },
  best: { text: 'Best', glyph: '★', color: '#33691e', textColor: '#ffffff' },
  excellent: { text: 'Excellent', glyph: '✓✓', color: '#9ccc65', textColor: '#15171b' },
  good: { text: 'Good', glyph: '✓', color: '#c5d6b8', textColor: '#15171b' },
  inaccuracy: { text: 'Inaccuracy', glyph: '?!', color: '#f6c445', textColor: '#15171b' },
  mistake: { text: 'Mistake', glyph: '?', color: '#ef6c00', textColor: '#15171b' },
  blunder: { text: 'Blunder', glyph: '??', color: '#c62828', textColor: '#ffffff' },
};
