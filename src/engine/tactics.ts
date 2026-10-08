import { Chess, fen as fenOps, IllegalSetup, Board } from 'chessops';
import { makeFen } from 'chessops/fen';
import { kingAttacks, knightAttacks, rookAttacks, bishopAttacks } from 'chessops/attacks';
import { Result, TacticalReport, MoveInput, Square, Color, PieceOnSquare, Role } from './types.js';
import { getLegalMoves } from './rules.js';
import { getPositionFacts, getGeometricAttackers } from './facts.js';
import { analyzeExchange, bestExchangePos } from './exchange.js';
import { toColor, toRole, toAlgebraic, fromAlgebraic } from './chessops-utils.js';

function doesPieceGeometricallyAttack(board: Board, fromSq: number, toSq: number): boolean {
  const role = board.getRole(fromSq);
  if (!role) return false;
  if (role === 'knight') return knightAttacks(fromSq).has(toSq);
  if (role === 'king') return kingAttacks(fromSq).has(toSq);
  if (role === 'rook') return rookAttacks(fromSq, board.occupied).has(toSq);
  if (role === 'bishop') return bishopAttacks(fromSq, board.occupied).has(toSq);
  if (role === 'queen') return rookAttacks(fromSq, board.occupied).has(toSq) || bishopAttacks(fromSq, board.occupied).has(toSq);
  if (role === 'pawn') {
    const color = board.white.has(fromSq) ? 'white' : 'black';
    const fFrom = fromSq % 8; const rFrom = Math.floor(fromSq / 8);
    const fTo = toSq % 8; const rTo = Math.floor(toSq / 8);
    if (Math.abs(fFrom - fTo) === 1) {
      if (color === 'white' && rFrom + 1 === rTo) return true;
      if (color === 'black' && rFrom - 1 === rTo) return true;
    }
  }
  return false;
}

export function analyzeTactics(fenBefore: string, moveInput: MoveInput): Result<TacticalReport> {
  const setupResult = fenOps.parseFen(fenBefore);
  if (setupResult.isErr) return { ok: false, error: { code: 'INVALID_FEN', message: 'Invalid FEN format' } };
  
  const posResult = Chess.fromSetup(setupResult.unwrap());
  if (posResult.isErr) {
    const errorCode = posResult.error.message === IllegalSetup.OppositeCheck ? 'ILLEGAL_POSITION' : 'INVALID_FEN';
    return { ok: false, error: { code: errorCode, message: posResult.error.message } };
  }
  const posBefore = posResult.unwrap();
  
  const legalMovesResult = getLegalMoves(fenBefore);
  if (!legalMovesResult.ok) return { ok: false, error: legalMovesResult.error };
  const legalMoves = legalMovesResult.value;
  
  const move = legalMoves.find(m => m.from === moveInput.from && m.to === moveInput.to && m.promotion === moveInput.promotion);
  if (!move) return { ok: false, error: { code: 'ILLEGAL_MOVE', message: 'Illegal move' } };
  if (move.isCastling) return { ok: false, error: { code: 'UNSUPPORTED_MOVE_TYPE', message: 'Castling not supported' } };

  const posAfter = posBefore.clone();
  posAfter.play({
    from: fromAlgebraic(move.from),
    to: fromAlgebraic(move.to),
    promotion: move.promotion
  });
  
  const fenAfter = makeFen(posAfter.toSetup());
  
  const factsAfterRes = getPositionFacts(fenAfter);
  if (!factsAfterRes.ok) return { ok: false, error: factsAfterRes.error };
  const factsAfter = factsAfterRes.value;
  
  const givesCheck = posAfter.isCheck();
  
  const afterLegalMovesRes = getLegalMoves(fenAfter);
  if (!afterLegalMovesRes.ok) return { ok: false, error: afterLegalMovesRes.error };
  const afterLegalMoves = afterLegalMovesRes.value;
  
  const deliversMate = givesCheck && afterLegalMoves.length === 0;
  const causesStalemate = !givesCheck && afterLegalMoves.length === 0;
  
  const moverColor = toColor(posBefore.turn);
  const opponentColor = toColor(posAfter.turn);
  
  const moverPinned = factsAfter.pins.find(p => p.pinned.square === move.to && p.pinned.color === moverColor) || null;
  
  const allowsMateInOne: { from: Square; to: Square; promotion?: Role }[] = [];
  const hangingAfterMove: { piece: PieceOnSquare; opponentGain: number; cause: 'defender_moved' | 'line_opened' | 'other' }[] = [];
  
  if (!deliversMate && !causesStalemate) {
    for (const reply of afterLegalMoves) {
      if (reply.promotion && reply.promotion !== 'queen') continue;
      
      const posReply = posAfter.clone();
      posReply.play({
        from: fromAlgebraic(reply.from),
        to: fromAlgebraic(reply.to),
        promotion: reply.promotion
      });
      
      if (posReply.isCheck()) {
        const replyFen = makeFen(posReply.toSetup());
        const replyMovesRes = getLegalMoves(replyFen);
        if (replyMovesRes.ok && replyMovesRes.value.length === 0) {
          allowsMateInOne.push({ from: reply.from, to: reply.to, promotion: reply.promotion });
        }
      }
    }
    allowsMateInOne.sort((a, b) => fromAlgebraic(a.from) !== fromAlgebraic(b.from) ? fromAlgebraic(a.from) - fromAlgebraic(b.from) : fromAlgebraic(a.to) - fromAlgebraic(b.to));
    
    const boardBefore = posBefore.board;
    const boardAfter = posAfter.board;
    
    const myPiecesSet = moverColor === 'white' ? boardAfter.white : boardAfter.black;
    const myPiecesArray = Array.from(myPiecesSet).filter(sq => sq !== fromAlgebraic(move.to) && !boardAfter.king.has(sq));
    
    for (const sq of myPiecesArray) {
      const pRole = toRole(boardAfter.getRole(sq)!);
      const piece: PieceOnSquare = { square: toAlgebraic(sq), role: pRole, color: moverColor };
      
      const canBeCaptured = afterLegalMoves.some(m => m.to === piece.square && m.isCapture);
      if (canBeCaptured) {
        const cache = new Map();
        const seeResult = bestExchangePos(posAfter, sq, pRole, moverColor, cache);
        if (seeResult.gain > 0) {
          let cause: 'defender_moved' | 'line_opened' | 'other' = 'other';
          const defendedBefore = doesPieceGeometricallyAttack(boardBefore, fromAlgebraic(move.from), sq);
          const defendsAfter = doesPieceGeometricallyAttack(boardAfter, fromAlgebraic(move.to), sq);
          if (defendedBefore && !defendsAfter) {
            cause = 'defender_moved';
          } else {
            const enemyColor = opponentColor;
            const attackersAfter = getGeometricAttackers(boardAfter, sq, enemyColor);
            const attackersBefore = getGeometricAttackers(boardBefore, sq, enemyColor);
            const newAttacker = attackersAfter.some(aSq => !attackersBefore.includes(aSq));
            if (newAttacker) cause = 'line_opened';
          }
          hangingAfterMove.push({ piece, opponentGain: seeResult.gain, cause });
        }
      }
    }
    hangingAfterMove.sort((a, b) => fromAlgebraic(a.piece.square) - fromAlgebraic(b.piece.square));
  }
  
  let exchangeLineMate: { stepIndex: number; matedColor: Color } | null = null;
  const exRes = analyzeExchange(fenBefore, moveInput);
  if (exRes.ok && exRes.value.bestLine.length > 0) {
    const replayPos = posAfter.clone();
    for (let i = 0; i < exRes.value.bestLine.length; i++) {
      const step = exRes.value.bestLine[i];
      replayPos.play({
        from: fromAlgebraic(step.capturer.square),
        to: fromAlgebraic(step.to),
        promotion: step.promotion
      });
      if (replayPos.isCheck()) {
        const replyFen = makeFen(replayPos.toSetup());
        const lmRes = getLegalMoves(replyFen);
        if (lmRes.ok && lmRes.value.length === 0) {
          exchangeLineMate = { stepIndex: i, matedColor: toColor(replayPos.turn) };
          break;
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      fenBefore,
      fenAfter,
      mover: { color: moverColor, role: move.role, from: move.from, to: move.to, promotion: move.promotion },
      givesCheck,
      deliversMate,
      causesStalemate,
      moverPinned,
      allowsMateInOne,
      hangingAfterMove,
      exchangeLineMate
    }
  };
}
