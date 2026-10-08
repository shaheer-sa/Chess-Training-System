/** Classification display constants shared between Analysis and Training screens. */
export const BADGE_INFO = {
  safe: { icon: '✓', text: 'Safe', meaning: 'No immediate material or tactical problem was found. It does not mean this is the best move.', color: '#2e7d32', textColor: '#ffffff' },
  even_trade: { icon: '⇄', text: 'Even trade', meaning: 'Your piece can be taken, but you win back the same value.', color: '#1565c0', textColor: '#ffffff' },
  loses_material: { icon: '⚠', text: 'Loses material', meaning: 'This move loses material or allows a tactic against you right away.', color: '#c62828', textColor: '#ffffff' },
  unclear: { icon: '?', text: 'Unclear', meaning: 'This needs deeper calculation than this trainer does — check it yourself.', color: '#f57f17', textColor: '#000000' },
} as const;

export type Label = keyof typeof BADGE_INFO;

export function formatPawns(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  const plural = Math.abs(pawns) === 1 ? 'pawn' : 'pawns';
  return `${sign}${pawns} ${plural}`;
}
