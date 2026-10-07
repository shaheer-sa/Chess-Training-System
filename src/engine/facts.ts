import { Chess, fen as fenOps, IllegalSetup, Board } from 'chessops';
import { between, kingAttacks, knightAttacks, rookAttacks, bishopAttacks } from 'chessops/attacks';
import { Result, PositionFacts, Pin, Color, PieceOnSquare, Square } from './types.js';
import { toColor, toRole, toAlgebraic, fromAlgebraic } from './chessops-utils.js';

export function getGeometricAttackers(board: Board, targetSqIdx: number, attackerColor: Color): number[] {
  const attackers: number[] = [];
  const attackerSet = attackerColor === 'white' ? board.white : board.black;
  
  const knights = attackerSet.intersect(board.knight);
  for (const n of knightAttacks(targetSqIdx).intersect(knights)) {
    attackers.push(n);
  }
  
  const kings = attackerSet.intersect(board.king);
  for (const k of kingAttacks(targetSqIdx).intersect(kings)) {
    attackers.push(k);
  }
  
  const rooksAndQueens = attackerSet.intersect(board.rook.union(board.queen));
  for (const r of rookAttacks(targetSqIdx, board.occupied).intersect(rooksAndQueens)) {
    attackers.push(r);
  }
  
  const bishopsAndQueens = attackerSet.intersect(board.bishop.union(board.queen));
  for (const b of bishopAttacks(targetSqIdx, board.occupied).intersect(bishopsAndQueens)) {
    attackers.push(b);
  }
  
  const pawns = attackerSet.intersect(board.pawn);
  const targetFile = targetSqIdx % 8;
  const targetRank = Math.floor(targetSqIdx / 8);
  for (const p of pawns) {
    const pFile = p % 8;
    const pRank = Math.floor(p / 8);
    if (Math.abs(pFile - targetFile) === 1) {
      if (attackerColor === 'white' && pRank + 1 === targetRank) {
        attackers.push(p);
      } else if (attackerColor === 'black' && pRank - 1 === targetRank) {
        attackers.push(p);
      }
    }
  }

  return attackers;
}

function buildKingZone(board: Board, kingSqIdx: number, attackerColor: Color): { king: Square; zone: Square[]; enemyAttackers: PieceOnSquare[] } {
  const zoneSquares = Array.from(kingAttacks(kingSqIdx));
  zoneSquares.push(kingSqIdx);
  
  const attackerIndices = new Set<number>();
  for (const zSq of zoneSquares) {
    const attackers = getGeometricAttackers(board, zSq, attackerColor);
    for (const a of attackers) {
      attackerIndices.add(a);
    }
  }
  
  const enemyAttackers: PieceOnSquare[] = Array.from(attackerIndices)
    .sort((a, b) => a - b)
    .map(sq => ({
      square: toAlgebraic(sq),
      role: toRole(board.getRole(sq)!),
      color: attackerColor
    }));
    
  return {
    king: toAlgebraic(kingSqIdx),
    zone: zoneSquares.sort((a, b) => a - b).map(sq => toAlgebraic(sq)),
    enemyAttackers
  };
}

function findPins(board: Board, targetColor: Color): Pin[] {
  const enemyColor = targetColor === 'white' ? 'black' : 'white';
  const enemySet = enemyColor === 'white' ? board.white : board.black;
  const targetSet = targetColor === 'white' ? board.white : board.black;
  
  const pins: Pin[] = [];
  const targets = Array.from(targetSet.intersect(board.king.union(board.queen)));
  const enemyRooksAndQueens = Array.from(enemySet.intersect(board.rook.union(board.queen)));
  const enemyBishopsAndQueens = Array.from(enemySet.intersect(board.bishop.union(board.queen)));
  
  for (const t of targets) {
    const tRole = toRole(board.getRole(t)!);
    
    for (const pinner of enemyRooksAndQueens) {
      const tFile = t % 8; const tRank = Math.floor(t / 8);
      const pFile = pinner % 8; const pRank = Math.floor(pinner / 8);
      if (tFile === pFile || tRank === pRank) {
        const betw = Array.from(between(t, pinner).intersect(board.occupied));
        if (betw.length === 1) {
          const blockerSq = betw[0];
          if (targetSet.has(blockerSq)) {
            const blockerRole = toRole(board.getRole(blockerSq)!);
            if (!(tRole === 'queen' && blockerRole === 'queen')) {
              pins.push({
                kind: tRole === 'king' ? 'absolute' : 'to_queen',
                pinned: { square: toAlgebraic(blockerSq), role: blockerRole, color: targetColor },
                pinner: { square: toAlgebraic(pinner), role: toRole(board.getRole(pinner)!), color: enemyColor },
                target: { square: toAlgebraic(t), role: tRole, color: targetColor }
              });
            }
          }
        }
      }
    }
    
    for (const pinner of enemyBishopsAndQueens) {
      const tFile = t % 8; const tRank = Math.floor(t / 8);
      const pFile = pinner % 8; const pRank = Math.floor(pinner / 8);
      if (Math.abs(tFile - pFile) === Math.abs(tRank - pRank) && t !== pinner) {
        const betw = Array.from(between(t, pinner).intersect(board.occupied));
        if (betw.length === 1) {
          const blockerSq = betw[0];
          if (targetSet.has(blockerSq)) {
            const blockerRole = toRole(board.getRole(blockerSq)!);
            if (!(tRole === 'queen' && blockerRole === 'queen')) {
              pins.push({
                kind: tRole === 'king' ? 'absolute' : 'to_queen',
                pinned: { square: toAlgebraic(blockerSq), role: blockerRole, color: targetColor },
                pinner: { square: toAlgebraic(pinner), role: toRole(board.getRole(pinner)!), color: enemyColor },
                target: { square: toAlgebraic(t), role: tRole, color: targetColor }
              });
            }
          }
        }
      }
    }
  }
  
  pins.sort((a, b) => fromAlgebraic(a.pinned.square) - fromAlgebraic(b.pinned.square));
  return pins;
}

export function getPositionFacts(fen: string): Result<PositionFacts> {
  const setupResult = fenOps.parseFen(fen);
  if (setupResult.isErr) {
    return { ok: false, error: { code: 'INVALID_FEN', message: 'Invalid FEN format' } };
  }

  const posResult = Chess.fromSetup(setupResult.unwrap());
  if (posResult.isErr) {
    const errorCode = posResult.error.message === IllegalSetup.OppositeCheck ? 'ILLEGAL_POSITION' : 'INVALID_FEN';
    return { ok: false, error: { code: errorCode, message: posResult.error.message } };
  }

  const pos = posResult.unwrap();
  const board = pos.board;
  const sideToMove = toColor(pos.turn);

  const whiteKing = Array.from(board.white.intersect(board.king))[0];
  const blackKing = Array.from(board.black.intersect(board.king))[0];
  
  if (whiteKing === undefined || blackKing === undefined) {
    return { ok: false, error: { code: 'ILLEGAL_POSITION', message: 'Missing king' } };
  }

  const kingZones = {
    white: buildKingZone(board, whiteKing, 'black'),
    black: buildKingZone(board, blackKing, 'white')
  };

  const inCheck = pos.isCheck();
  const checkers: PieceOnSquare[] = [];
  if (inCheck) {
    const kingSq = pos.turn === 'white' ? whiteKing : blackKing;
    const enemyColor = pos.turn === 'white' ? 'black' : 'white';
    const attackerIndices = getGeometricAttackers(board, kingSq, enemyColor);
    for (const a of attackerIndices) {
      checkers.push({
        square: toAlgebraic(a),
        role: toRole(board.getRole(a)!),
        color: enemyColor
      });
    }
    checkers.sort((a, b) => fromAlgebraic(a.square) - fromAlgebraic(b.square));
  }

  const whitePins = findPins(board, 'white');
  const blackPins = findPins(board, 'black');
  const pins = [...whitePins, ...blackPins].sort((a, b) => fromAlgebraic(a.pinned.square) - fromAlgebraic(b.pinned.square));

  return {
    ok: true,
    value: {
      sideToMove,
      inCheck,
      checkers,
      pins,
      kingZones
    }
  };
}
