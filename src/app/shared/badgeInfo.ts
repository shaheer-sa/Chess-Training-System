/** Classification display constants shared by every screen. 'tactic' only comes from the engine check (phase 5C). */
export const BADGE_INFO = {
  safe: { text: 'Safe', meaning: 'No immediate material or tactical problem was found. It does not mean this is the best move.', color: '#2e7d32', textColor: '#ffffff' },
  even_trade: { text: 'Even trade', meaning: 'Your piece can be taken, but you win back the same value.', color: '#1565c0', textColor: '#ffffff' },
  loses_material: { text: 'Loses material', meaning: 'This move loses material or allows a tactic against you right away.', color: '#c62828', textColor: '#ffffff' },
  unclear: { text: 'Unclear', meaning: 'This needs deeper calculation than this trainer does — check it yourself.', color: '#E3B12C', textColor: '#15171b' },
  tactic: { text: 'Tactic', meaning: 'Strong only if you find the right follow-up — otherwise it can cost you. Found by the engine check; it never shows the follow-up.', color: '#6a1b9a', textColor: '#ffffff' },
} as const;

export type Label = keyof typeof BADGE_INFO;

export function formatPawns(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  const plural = Math.abs(pawns) === 1 ? 'pawn' : 'pawns';
  return `${sign}${pawns} ${plural}`;
}
