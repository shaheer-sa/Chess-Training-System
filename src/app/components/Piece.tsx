import React from 'react';
import wK from '../assets/pieces/cburnett/white-king.svg';
import wQ from '../assets/pieces/cburnett/white-queen.svg';
import wR from '../assets/pieces/cburnett/white-rook.svg';
import wB from '../assets/pieces/cburnett/white-bishop.svg';
import wN from '../assets/pieces/cburnett/white-knight.svg';
import wP from '../assets/pieces/cburnett/white-pawn.svg';
import bK from '../assets/pieces/cburnett/black-king.svg';
import bQ from '../assets/pieces/cburnett/black-queen.svg';
import bR from '../assets/pieces/cburnett/black-rook.svg';
import bB from '../assets/pieces/cburnett/black-bishop.svg';
import bN from '../assets/pieces/cburnett/black-knight.svg';
import bP from '../assets/pieces/cburnett/black-pawn.svg';

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceColor = 'w' | 'b';

interface PieceProps {
  color: PieceColor;
  type: PieceType;
  style?: React.CSSProperties;
}

const SVGS: Record<string, string> = {
  wK, wQ, wR, wB, wN, wP,
  bK, bQ, bR, bB, bN, bP
};

export const Piece: React.FC<PieceProps> = ({ color, type, style }) => {
  const src = SVGS[`${color}${type}`];
  if (!src) return null;

  return (
    <img 
      src={src} 
      alt="" 
      aria-hidden="true"
      style={{
        userSelect: 'none',
        pointerEvents: 'none',
        ...style
      }} 
    />
  );
};
