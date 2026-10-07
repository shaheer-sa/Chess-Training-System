import { fen as fenOps, Chess, Move as ChessopsMove, opposite } from 'chessops';
import { makeFen } from 'chessops/fen';
import {
  Result,
  DestinationReport,
  MoveInput,
  CaptureOption,
  PieceOnSquare
} from './types.js';
import { getLegalMoves } from './rules.js';
import { fromAlgebraic, toAlgebraic, toRole, toColor } from './chessops-utils.js';

export function analyzeDestination(
  fen: string,
  move: MoveInput
): Result<DestinationReport> {
  const setupResult = fenOps.parseFen(fen);
  if (setupResult.isErr) {
    return { ok: false, error: { code: 'INVALID_FEN', message: 'Invalid FEN format' } };
  }

  const posResult = Chess.fromSetup(setupResult.unwrap());
  if (posResult.isErr) {
    return {
      ok: false,
      error: { code: 'ILLEGAL_POSITION', message: posResult.error.message },
    };
  }
  const pos = posResult.unwrap();
  const colorToMove = toColor(pos.turn);

  // Validate the move is legal
  const legalMovesResult = getLegalMoves(fen);
  if (!legalMovesResult.ok) {
    return legalMovesResult;
  }
  
  const legalMove = legalMovesResult.value.find(
    (lm) =>
      lm.from === move.from &&
      lm.to === move.to &&
      lm.promotion === move.promotion
  );

  if (!legalMove) {
    return {
      ok: false,
      error: { code: 'ILLEGAL_MOVE', message: 'The move is not legal in the given position' },
    };
  }

  if (legalMove.isCastling) {
    return {
      ok: false,
      error: { code: 'UNSUPPORTED_MOVE_TYPE', message: 'Castling is not supported in Phase 1A' },
    };
  }

  // Construct chessops move
  // Note: castling is rejected above, so we don't need to do king-to-rook conversion here
  const chessopsMove: ChessopsMove = {
    from: fromAlgebraic(move.from),
    to: fromAlgebraic(move.to),
    promotion: move.promotion ? move.promotion : undefined,
  };

  // Play the move
  const posAfter = pos.clone();
  posAfter.play(chessopsMove);
  const fenAfter = makeFen(posAfter.toSetup());

  const toSqNum = fromAlgebraic(move.to);
  const opponentColor = opposite(pos.turn);

  // Find geometric attackers/defenders on the posAfter
  // Attacks are calculated as if a king were on the destination square.
  const attackersSet = posAfter.kingAttackers(toSqNum, opponentColor, posAfter.board.occupied);
  const defendersSet = posAfter.kingAttackers(toSqNum, pos.turn, posAfter.board.occupied);

  // Remove the moved piece from geometric defenders
  // The moved piece is on `toSqNum`. Wait, `attacks` does not include the piece on `toSqNum` itself anyway, 
  // because a piece doesn't attack its own square. But wait! The spec says "EXCLUDING the moved piece itself". 
  // If we moved a rook to `toSqNum`, it doesn't attack `toSqNum`. But what if a pawn moved, and we evaluate `toSqNum`?
  // Still, a piece does not attack its own square. But let's explicitly remove it just in case.
  const finalDefendersSet = defendersSet.without(toSqNum);

  const geometricAttackers: PieceOnSquare[] = [];
  for (const sq of attackersSet) {
    geometricAttackers.push({
      square: toAlgebraic(sq),
      role: toRole(posAfter.board.getRole(sq)!),
      color: toColor(opponentColor),
    });
  }

  const geometricDefenders: PieceOnSquare[] = [];
  for (const sq of finalDefendersSet) {
    geometricDefenders.push({
      square: toAlgebraic(sq),
      role: toRole(posAfter.board.getRole(sq)!),
      color: toColor(pos.turn),
    });
  }

  const sortPieceOnSquare = (a: PieceOnSquare, b: PieceOnSquare) =>
    fromAlgebraic(a.square) - fromAlgebraic(b.square);

  geometricAttackers.sort(sortPieceOnSquare);
  geometricDefenders.sort(sortPieceOnSquare);

  // Analyze legal captures by opponent
  const opponentLegalMovesResult = getLegalMoves(fenAfter);
  if (!opponentLegalMovesResult.ok) {
    return {
      ok: false,
      error: { code: 'ILLEGAL_POSITION', message: 'Position after move is illegal' },
    };
  }

  const legalCaptures: CaptureOption[] = [];

  // A capture targets the moved piece. The moved piece is at `move.to`.
  // However, if the candidate move was a pawn double push, it can be captured en passant.
  // The pawn is physically at `move.to`. An en passant capture would land on `posAfter.epSquare` (which is `move.to` +/- 8).
  // The spec says: "en passant counts... an en passant capture removes the moved pawn even though it lands on a different square."
  
  for (const oppMove of opponentLegalMovesResult.value) {
    // If the opponent capture promotes, analyze only the queen promotion.
    if (oppMove.promotion && oppMove.promotion !== 'queen') continue;

    // Check if it captures our moved piece
    const landsOnTo = oppMove.to === move.to;
    const isOurPawnEP = legalMove.role === 'pawn' && 
                        Math.abs(fromAlgebraic(move.from) - fromAlgebraic(move.to)) === 16 &&
                        oppMove.isEnPassant &&
                        oppMove.to === toAlgebraic(posAfter.epSquare!);
    
    if (landsOnTo || isOurPawnEP) {
      // Find legal recaptures
      // Play the opponent's capture on posAfter
      const capturePos = posAfter.clone();
      const oppChessopsMove: ChessopsMove = {
        from: fromAlgebraic(oppMove.from),
        to: fromAlgebraic(oppMove.to),
        promotion: oppMove.promotion,
      };
      capturePos.play(oppChessopsMove);
      const fenAfterCapture = makeFen(capturePos.toSetup());

      const recapturesResult = getLegalMoves(fenAfterCapture);
      const legalRecaptures: PieceOnSquare[] = [];
      if (recapturesResult.ok) {
        for (const recapMove of recapturesResult.value) {
          if (recapMove.to === oppMove.to) {
            legalRecaptures.push({
              square: recapMove.from,
              role: recapMove.role,
              color: colorToMove, // we are recapturing
            });
          }
        }
      }

      legalRecaptures.sort(sortPieceOnSquare);

      legalCaptures.push({
        capturer: {
          square: oppMove.from,
          role: oppMove.role,
          color: toColor(opponentColor),
        },
        captureSquare: oppMove.to,
        isEnPassant: oppMove.isEnPassant,
        promotion: oppMove.promotion,
        legalRecaptures,
      });
    }
  }

  // Deterministically order legalCaptures by capturer square index
  legalCaptures.sort(
    (a, b) => fromAlgebraic(a.capturer.square) - fromAlgebraic(b.capturer.square)
  );

  const givesCheck = posAfter.isCheck();

  return {
    ok: true,
    value: {
      fenBefore: fen,
      fenAfter,
      mover: {
        color: colorToMove,
        role: legalMove.role,
        from: legalMove.from,
        to: legalMove.to,
        promotion: legalMove.promotion,
      },
      givesCheck,
      geometricAttackers,
      geometricDefenders,
      legalCaptures,
    },
  };
}
