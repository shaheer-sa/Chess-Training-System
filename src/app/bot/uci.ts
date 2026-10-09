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
