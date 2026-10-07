import React from 'react';

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceColor = 'w' | 'b';

interface PieceProps {
  color: PieceColor;
  type: PieceType;
  style?: React.CSSProperties;
}

const unicodePieces: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

export const Piece: React.FC<PieceProps> = ({ color, type, style }) => {
  // We use standard Unicode pieces for the MVP because they are simple, open licensed, and don't require external assets.
  const symbol = unicodePieces[`${color}${type}`];
  return (
    <div style={{
      fontSize: '2.5rem',
      lineHeight: '1',
      userSelect: 'none',
      ...style
    }} aria-hidden="true">
      {symbol}
    </div>
  );
};
