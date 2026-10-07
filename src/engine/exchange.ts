import { Chess, fen as fenOps, IllegalSetup } from 'chessops';
import { makeFen } from 'chessops/fen';
import {
  Result,
  ExchangeReport,
  ExchangeStep,
  MoveInput,
  Square,
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

function bestExchange(fen: string, targetSquare: Square): SeeResult {
  const legalMovesResult = getLegalMoves(fen);
  if (!legalMovesResult.ok) {
    throw new Error(
      `Internal invariant violation: getLegalMoves failed during exchange recursion: ${legalMovesResult.error.message}`
    );
  }

  const setupResult = fenOps.parseFen(fen);
  const pos = Chess.fromSetup(setupResult.unwrap()).unwrap();
  const side = toColor(pos.turn);
  
  let bestGain = 0;
  let bestLine: ExchangeStep[] = [];
  let bestCapture: LegalMove | null = null;
  
  const targetSqIdx = fromAlgebraic(targetSquare);
  if (!pos.board.occupied.has(targetSqIdx)) {
     return { gain: 0, line: [], move: null };
  }
  const targetRole = toRole(pos.board.getRole(targetSqIdx)!);
  const targetColor = toColor(pos.board.getColor(targetSqIdx)!);

  for (const m of legalMovesResult.value) {
    if (m.promotion && m.promotion !== 'queen') continue;

    let capturesTarget = false;
    let actualCapturedSquare = m.to;

    if (m.to === targetSquare) {
      if (m.isCapture) capturesTarget = true;
    } else if (m.isEnPassant) {
      const epCapturedIdx = pos.turn === 'white' ? fromAlgebraic(m.to) - 8 : fromAlgebraic(m.to) + 8;
      if (epCapturedIdx === targetSqIdx) {
        capturesTarget = true;
        actualCapturedSquare = toAlgebraic(epCapturedIdx);
      }
    }

    if (!capturesTarget) continue;

    const promotionGain = m.promotion === 'queen' ? PIECE_VALUES['queen'] - PIECE_VALUES['pawn'] : 0;
    const capturedValue = getPieceValue(targetRole);
    
    const posAfter = pos.clone();
    posAfter.play({
      from: fromAlgebraic(m.from),
      to: fromAlgebraic(m.to),
      promotion: m.promotion,
    });
    const fenAfter = makeFen(posAfter.toSetup());
    const givesCheck = posAfter.isCheck();

    const childResult = bestExchange(fenAfter, m.to);
    
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
          square: actualCapturedSquare,
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

  return { gain: bestGain, line: bestLine, move: bestCapture };
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
  const seeResult = bestExchange(fenAfter, targetSquareForNext);
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
  const opponentLegalMoves = getLegalMoves(fenAfter);
  if (opponentLegalMoves.ok) {
    const oppMoves = opponentLegalMoves.value;
    
    for (const oppMove of oppMoves) {
      if (oppMove.promotion && oppMove.promotion !== 'queen') continue;

      let capturesTarget = false;
      let actualCapturedSquare = oppMove.to;

      if (oppMove.to === targetSquareForNext) {
        if (oppMove.isCapture) capturesTarget = true;
      } else if (oppMove.isEnPassant) {
        const epIdx = posAfter.turn === 'white' ? fromAlgebraic(oppMove.to) - 8 : fromAlgebraic(oppMove.to) + 8;
        if (toAlgebraic(epIdx) === targetSquareForNext) {
          capturesTarget = true;
          actualCapturedSquare = toAlgebraic(epIdx);
        }
      }

      if (capturesTarget) {
        const childPos = posAfter.clone();
        childPos.play({
          from: fromAlgebraic(oppMove.from),
          to: fromAlgebraic(oppMove.to),
          promotion: oppMove.promotion,
        });
        const childFen = makeFen(childPos.toSetup());
        
        const capturedRole = toRole(posAfter.board.getRole(fromAlgebraic(actualCapturedSquare))!);
        const promoGain = oppMove.promotion === 'queen' ? PIECE_VALUES['queen'] - PIECE_VALUES['pawn'] : 0;
        const baseGain = getPieceValue(capturedRole) + promoGain;
        
        const moverResponse = bestExchange(childFen, oppMove.to);
        
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
    }
  }

  captureOptions.sort((a, b) => fromAlgebraic(a.capturer.square) - fromAlgebraic(b.capturer.square));

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
