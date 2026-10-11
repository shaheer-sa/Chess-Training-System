import React from 'react';
import { useSiteSettings } from '../useSiteSettings.js';
import { PieceSet } from '../settings.js';

/** Every piece set's images (URLs), by path: ../assets/pieces/<set>/<white|black>-<role>.svg */
const FILES = import.meta.glob('../assets/pieces/*/*.svg', { eager: true, import: 'default' }) as Record<string, string>;
const ROLE: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };

export const pieceUrl = (set: PieceSet, color: 'w' | 'b', type: string): string | undefined =>
  FILES[`../assets/pieces/${set}/${color === 'w' ? 'white' : 'black'}-${ROLE[type]}.svg`]
  ?? FILES[`../assets/pieces/cburnett/${color === 'w' ? 'white' : 'black'}-${ROLE[type]}.svg`];

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceColor = 'w' | 'b';

interface PieceProps {
  color: PieceColor;
  type: PieceType;
  style?: React.CSSProperties;
}

export const Piece: React.FC<PieceProps & { set?: PieceSet }> = ({ color, type, style, set }) => {
  const site = useSiteSettings();
  const src = pieceUrl(set ?? site.pieceSet, color, type);
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
