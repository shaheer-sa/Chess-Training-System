import { Square as ChessopsSquare, Role as ChessopsRole, Color as ChessopsColor, makeSquare, parseSquare } from 'chessops';
import { Square, Role, Color } from './types.js';

export function toAlgebraic(sq: ChessopsSquare): Square {
  return makeSquare(sq) as Square;
}

export function fromAlgebraic(sq: Square): ChessopsSquare {
  const parsed = parseSquare(sq);
  if (parsed === undefined) {
    throw new Error(`Invalid square: ${sq}`);
  }
  return parsed;
}

export function toRole(role: ChessopsRole): Role {
  return role as Role;
}

export function fromRole(role: Role): ChessopsRole {
  return role as ChessopsRole;
}

export function toColor(color: ChessopsColor): Color {
  return color as Color;
}

export function fromColor(color: Color): ChessopsColor {
  return color as ChessopsColor;
}

export function isCastling(from: ChessopsSquare, to: ChessopsSquare, role: ChessopsRole): boolean {
  if (role !== 'king') return false;
  const fileFrom = from % 8;
  const fileTo = to % 8;
  return Math.abs(fileFrom - fileTo) > 1 || (fileFrom === 4 && (fileTo === 0 || fileTo === 7));
}

export function normalizeCastling(from: ChessopsSquare, to: ChessopsSquare, role: ChessopsRole, color: ChessopsColor): { from: ChessopsSquare, to: ChessopsSquare, isCastling: boolean } {
  if (role !== 'king') return { from, to, isCastling: false };
  const fromSq = makeSquare(from);
  const toSq = makeSquare(to);

  if (color === 'white' && fromSq === 'e1') {
    if (toSq === 'h1' || toSq === 'g1') return { from, to: parseSquare('g1')!, isCastling: true };
    if (toSq === 'a1' || toSq === 'c1') return { from, to: parseSquare('c1')!, isCastling: true };
  } else if (color === 'black' && fromSq === 'e8') {
    if (toSq === 'h8' || toSq === 'g8') return { from, to: parseSquare('g8')!, isCastling: true };
    if (toSq === 'a8' || toSq === 'c8') return { from, to: parseSquare('c8')!, isCastling: true };
  }

  return { from, to, isCastling: false };
}
