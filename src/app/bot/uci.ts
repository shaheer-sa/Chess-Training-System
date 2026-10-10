export const parseBestMove = (line: string): string | null => {
  if (!line.startsWith('bestmove ')) return null;
  const parts = line.split(' ');
  const move = parts[1];
  if (move === '(none)') return null;
  return move || null;
};

export const chooseMove = (engineMove: string, legalMoves: string[], randomMoveChance: number, rng: () => number): string => {
  if (legalMoves.length > 0 && rng() < randomMoveChance) {
    const index = Math.floor(rng() * legalMoves.length);
    return legalMoves[index];
  }
  return engineMove;
};

const PROMOTION_ROLES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' } as const;

/**
 * The piece the computer promotes to. It always promotes by itself (the promotion dialog is for the human only):
 * a queen, unless a strength-limited level (4–6) deliberately chose a knight (the one under-promotion that can be
 * better: a knight check or fork). Lower levels and random moves always get a queen.
 */
export const botPromotion = (uci: string, level: number): 'queen' | 'knight' =>
  PROMOTION_ROLES[uci[4] as keyof typeof PROMOTION_ROLES] === 'knight' && level >= 4 ? 'knight' : 'queen';
