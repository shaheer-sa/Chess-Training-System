import { Chess, fen as fenOps, IllegalSetup } from 'chessops';
import { Result, LegalMove } from './types.js';
import { toAlgebraic, toRole, normalizeCastling, fromAlgebraic } from './chessops-utils.js';

export function getLegalMoves(fen: string): Result<LegalMove[]> {
  const setupResult = fenOps.parseFen(fen);
  if (setupResult.isErr) {
    return { ok: false, error: { code: 'INVALID_FEN', message: 'Invalid FEN format' } };
  }

  const posResult = Chess.fromSetup(setupResult.unwrap());
  if (posResult.isErr) {
    const errorCode: 'ILLEGAL_POSITION' | 'INVALID_FEN' = 
      posResult.error.message === IllegalSetup.OppositeCheck ? 'ILLEGAL_POSITION' : 'INVALID_FEN';
    return { ok: false, error: { code: errorCode, message: posResult.error.message } };
  }

  const pos = posResult.unwrap();
  const legalMoves: LegalMove[] = [];

  // Iterate over all squares to find pieces of the side to move
  for (const from of pos.board.occupied.intersect(pos.board[pos.turn])) {
    const role = pos.board.getRole(from)!;
    const dests = pos.dests(from);
    
    for (const to of dests) {
      const isCapture = pos.board.occupied.has(to) && !pos.board[pos.turn].has(to);
      const isEnPassant = role === 'pawn' && to === pos.epSquare;
      
      const normalized = normalizeCastling(from, to, role, pos.turn);
      const isCastling = normalized.isCastling;
      const targetTo = normalized.to;

      // Promotions
      if (role === 'pawn' && (targetTo < 8 || targetTo > 55)) {
        const promotions = ['queen', 'rook', 'bishop', 'knight'] as const;
        for (const promotion of promotions) {
          legalMoves.push({
            from: toAlgebraic(from),
            to: toAlgebraic(targetTo),
            role: toRole(role),
            promotion,
            isCapture: isCapture || isEnPassant,
            isEnPassant,
            isCastling: false,
          });
        }
      } else {
        legalMoves.push({
          from: toAlgebraic(from),
          to: toAlgebraic(targetTo),
          role: toRole(role),
          isCapture: isCapture || isEnPassant,
          isEnPassant,
          isCastling,
        });
      }
    }
  }

  // Deterministic ordering: by from-index, then to-index, then promotion alphabetical
  legalMoves.sort((a, b) => {
    const fromDiff = fromAlgebraic(a.from) - fromAlgebraic(b.from);
    if (fromDiff !== 0) return fromDiff;
    const toDiff = fromAlgebraic(a.to) - fromAlgebraic(b.to);
    if (toDiff !== 0) return toDiff;
    if (a.promotion !== b.promotion) {
      if (!a.promotion) return -1;
      if (!b.promotion) return 1;
      return a.promotion.localeCompare(b.promotion);
    }
    return 0;
  });

  return { ok: true, value: legalMoves };
}
