import { Chess, fen as fenOps, IllegalSetup } from 'chessops';
import { makeFen } from 'chessops/fen';
import {
  Result,
  ExchangeReport,
  ExchangeStep,
  MoveInput,
  Color,
  Role,
  LegalMove,
} from './types.js';
import { getLegalMoves } from './rules.js';
import { fromAlgebraic, toAlgebraic, toRole, toColor } from './chessops-utils.js';

export const PIECE_VALUES: Record<Exclude<Role, 'king'>, number> = {
  pawn: 100,
  knight: 300,
  bishop: 300,
  rook: 500,
  queen: 900,
};

const TIE_BREAK_ORDER: Record<Role, number> = {
  pawn: 100,
  knight: 300,
  bishop: 300,
  rook: 500,
  queen: 900,
  king: 10000,
};

function getPieceValue(role: Role): number {
  if (role === 'king') return 0;
  return PIECE_VALUES[role];
}

interface SeeResult {
  gain: number;
  line: ExchangeStep[];
  move: LegalMove | null;
}

function tieBreak(a: LegalMove, b: LegalMove): boolean {
  const valA = TIE_BREAK_ORDER[a.role];
  const valB = TIE_BREAK_ORDER[b.role];
  if (valA !== valB) return valA < valB;
  return fromAlgebraic(a.from) < fromAlgebraic(b.from);
}

function bestExchangePos(
  pos: Chess,
  targetSqIdx: number,
  targetRole: Role,
  targetColor: Color,
  cache: Map<string, SeeResult>
): SeeResult {
  // Memo is valid ONLY within a single analyzeExchange call: every
  // position in the tree derives from the root by captures onto one
  // target square, so non-target squares always hold their original
  // pieces. Do NOT reuse this cache across calls or for other analyses.
  const cacheKey = `${pos.board.occupied.lo}|${pos.board.occupied.hi}|${pos.board.white.lo}|${pos.board.white.hi}|${pos.turn}|${pos.epSquare ?? -1}|${targetSqIdx}|${targetRole}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const side = toColor(pos.turn);
  let bestGain = 0;
  let bestLine: ExchangeStep[] = [];
  let bestCapture: LegalMove | null = null;
  
  const turnSet = pos.turn === 'white' ? pos.board.white : pos.board.black;
  const epLandingSq = pos.turn === 'white' ? targetSqIdx + 8 : targetSqIdx - 8;
  const isEpPossible = pos.epSquare !== undefined && pos.epSquare === epLandingSq && targetRole === 'pawn';

  const candidates: LegalMove[] = [];

  for (const fromSq of turnSet) {
    const dests = pos.dests(fromSq);
    
    if (dests.has(targetSqIdx)) {
      const role = toRole(pos.board.getRole(fromSq)!);
      const isPromo = role === 'pawn' && (targetSqIdx >= 56 || targetSqIdx <= 7);
      
      candidates.push({
        from: toAlgebraic(fromSq),
        to: toAlgebraic(targetSqIdx),
        role,
        promotion: isPromo ? 'queen' : undefined,
        isCapture: true,
        isEnPassant: false,
        isCastling: false,
      });
    }
    
    if (isEpPossible && dests.has(pos.epSquare!)) {
      const role = toRole(pos.board.getRole(fromSq)!);
      if (role === 'pawn' && (fromSq % 8) !== (pos.epSquare! % 8)) {
        candidates.push({
          from: toAlgebraic(fromSq),
          to: toAlgebraic(pos.epSquare!),
          role: 'pawn',
          promotion: undefined,
          isCapture: true,
          isEnPassant: true,
          isCastling: false,
        });
      }
    }
  }

  for (const m of candidates) {
    const promotionGain = m.promotion === 'queen' ? PIECE_VALUES['queen'] - PIECE_VALUES['pawn'] : 0;
    const capturedValue = getPieceValue(targetRole);
    
    const posAfter = pos.clone();
    posAfter.play({
      from: fromAlgebraic(m.from),
      to: fromAlgebraic(m.to),
      promotion: m.promotion,
    });
    const givesCheck = posAfter.isCheck();

    const nextTargetRole = m.promotion === 'queen' ? 'queen' : m.role;
    const childResult = bestExchangePos(posAfter, fromAlgebraic(m.to), nextTargetRole, side, cache);
    
    const currentGain = capturedValue + promotionGain - childResult.gain;

    const isBetter = currentGain > bestGain || 
       (bestCapture === null && currentGain === bestGain) || 
       (bestCapture !== null && currentGain === bestGain && tieBreak(m, bestCapture));

    if (isBetter) {
      bestGain = currentGain;
      bestCapture = m;
      
      const step: ExchangeStep = {
        side,
        capturer: {
          square: m.from,
          role: m.role,
          color: side,
        },
        to: m.to,
        captured: {
          square: toAlgebraic(targetSqIdx),
          role: targetRole,
          color: targetColor,
        },
        promotion: m.promotion,
        givesCheck: givesCheck,
        balanceAfter: 0,
      };
      bestLine = [step, ...childResult.line];
    }
  }

  const result: SeeResult = { gain: bestGain, line: bestLine, move: bestCapture };
  cache.set(cacheKey, result);
  return result;
}

export function analyzeExchange(fen: string, move: MoveInput): Result<ExchangeReport> {
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
  const moverColor = toColor(pos.turn);

  const legalMovesResult = getLegalMoves(fen);
  if (!legalMovesResult.ok) return legalMovesResult;

  const legalMove = legalMovesResult.value.find(lm => 
    lm.from === move.from && lm.to === move.to && lm.promotion === move.promotion
  );

  if (!legalMove) {
    return { ok: false, error: { code: 'ILLEGAL_MOVE', message: 'The move is not legal in the given position' } };
  }
  if (legalMove.isCastling) {
    return { ok: false, error: { code: 'UNSUPPORTED_MOVE_TYPE', message: 'Castling is not supported' } };
  }

  const cache = new Map<string, SeeResult>();

  // Calculate materialFromMove
  let materialFromMove = 0;

  if (legalMove.isCapture) {
    let capturedSqIdx = fromAlgebraic(legalMove.to);
    if (legalMove.isEnPassant) {
      capturedSqIdx = pos.turn === 'white' ? fromAlgebraic(legalMove.to) - 8 : fromAlgebraic(legalMove.to) + 8;
    }
    const capturedRole = toRole(pos.board.getRole(capturedSqIdx)!);
    materialFromMove += getPieceValue(capturedRole);
  }

  if (legalMove.promotion === 'queen') {
    materialFromMove += PIECE_VALUES['queen'] - PIECE_VALUES['pawn'];
  }

  const posAfter = pos.clone();
  posAfter.play({
    from: fromAlgebraic(legalMove.from),
    to: fromAlgebraic(legalMove.to),
    promotion: legalMove.promotion
  });
  const fenAfter = makeFen(posAfter.toSetup());

  const targetSquareForNext = legalMove.to;
  const targetSqIdxForNext = fromAlgebraic(targetSquareForNext);
  const targetRoleNext = legalMove.promotion === 'queen' ? 'queen' : legalMove.role;

  const seeResult = bestExchangePos(
    posAfter,
    targetSqIdxForNext,
    targetRoleNext,
    moverColor,
    cache
  );
  const see = materialFromMove - seeResult.gain;

  // Compute balanceAfter for the best line
  let runningBalance = materialFromMove;
  for (const step of seeResult.line) {
    const val = getPieceValue(step.captured.role) + (step.promotion === 'queen' ? PIECE_VALUES['queen'] - PIECE_VALUES['pawn'] : 0);
    if (step.side === moverColor) {
      runningBalance += val;
    } else {
      runningBalance -= val;
    }
    step.balanceAfter = runningBalance;
  }

  const captureOptions = [];
  
  const oppTurnSet = posAfter.turn === 'white' ? posAfter.board.white : posAfter.board.black;
  const oppEpLandingSq = posAfter.turn === 'white' ? targetSqIdxForNext + 8 : targetSqIdxForNext - 8;
  const oppIsEpPossible = posAfter.epSquare !== undefined && posAfter.epSquare === oppEpLandingSq && targetRoleNext === 'pawn';

  const oppCandidates: LegalMove[] = [];

  for (const fromSq of oppTurnSet) {
    const dests = posAfter.dests(fromSq);
    
    if (dests.has(targetSqIdxForNext)) {
      const role = toRole(posAfter.board.getRole(fromSq)!);
      const isPromo = role === 'pawn' && (targetSqIdxForNext >= 56 || targetSqIdxForNext <= 7);
      
      oppCandidates.push({
        from: toAlgebraic(fromSq),
        to: toAlgebraic(targetSqIdxForNext),
        role,
        promotion: isPromo ? 'queen' : undefined,
        isCapture: true,
        isEnPassant: false,
        isCastling: false,
      });
    }
    
    if (oppIsEpPossible && dests.has(posAfter.epSquare!)) {
      const role = toRole(posAfter.board.getRole(fromSq)!);
      if (role === 'pawn' && (fromSq % 8) !== (posAfter.epSquare! % 8)) {
        oppCandidates.push({
          from: toAlgebraic(fromSq),
          to: toAlgebraic(posAfter.epSquare!),
          role: 'pawn',
          promotion: undefined,
          isCapture: true,
          isEnPassant: true,
          isCastling: false,
        });
      }
    }
  }

  for (const oppMove of oppCandidates) {
    const childPos = posAfter.clone();
    childPos.play({
      from: fromAlgebraic(oppMove.from),
      to: fromAlgebraic(oppMove.to),
      promotion: oppMove.promotion,
    });
    
    const promoGain = oppMove.promotion === 'queen' ? PIECE_VALUES['queen'] - PIECE_VALUES['pawn'] : 0;
    const baseGain = getPieceValue(targetRoleNext) + promoGain;
    
    const nextTargetRole = oppMove.promotion === 'queen' ? 'queen' : oppMove.role;
    const moverResponse = bestExchangePos(
      childPos,
      fromAlgebraic(oppMove.to),
      nextTargetRole,
      toColor(posAfter.turn),
      cache
    );
    
    const opponentNetGain = baseGain - moverResponse.gain;
    const resultForMover = materialFromMove - opponentNetGain;

    captureOptions.push({
      capturer: {
        square: oppMove.from,
        role: oppMove.role,
        color: toColor(posAfter.turn),
      },
      captureSquare: oppMove.to,
      isEnPassant: oppMove.isEnPassant,
      promotion: oppMove.promotion,
      resultForMover,
    });
  }

  return {
    ok: true,
    value: {
      fenBefore: fen,
      fenAfter,
      mover: {
        color: moverColor,
        role: legalMove.role,
        from: legalMove.from,
        to: legalMove.to,
        promotion: legalMove.promotion,
      },
      materialFromMove,
      see,
      bestLine: seeResult.line,
      captureOptions,
    }
  };
}
