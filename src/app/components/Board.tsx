import React from 'react';
import { Chess, fen as fenOps } from 'chessops';
import { Piece } from './Piece.js';
import { BADGE_INFO, Label } from '../shared/badgeInfo.js';

/** What the board needs to draw a badge: the destination and the label (incl. the engine-check 'tactic'). */
export type BoardMove = Pick<MoveClassification, 'move'> & { label: Label };
import { MoveClassification, Square } from '../../engine/types.js';
import { LabelIcon } from './LabelIcon.js';
import { squareOffset } from './boardGeometry.js';

interface BoardProps {
  position: Chess;
  flipped: boolean;
  onSquareClick?: (index: number) => void;
  selectedSquare: number | null;
  destinationSquare: number | null;
  moves: BoardMove[];
  expandedLevel: number;
  exchangeStep: number;
  selectedDestInfo: MoveClassification | null;
  focusedSquare?: number;
  setFocusedSquare?: (sq: number) => void;
  readOnly?: boolean;
  showBadgesOnReadOnly?: boolean;
  arrow?: { from: Square; to: Square } | null;
  lastMove?: { from: number; to: number };
  checkSquare?: number;
  legalDestinations?: number[];
  onSquarePointerDown?: (index: number, pointerType: string) => void;
  onSquarePointerUp?: (index: number) => void;
  onSquarePointerCancel?: (index: number) => void;
  onSquareMouseEnter?: (index: number) => void;
  onSquareMouseLeave?: (index: number) => void;
  animateMoves?: { from: number; to: number }[];
  animationKey?: string | number;
  draggableSquares?: number[];
  onPieceDrop?: (from: number, to: number) => void;
  onPieceDragStart?: (from: number) => void;
  onDragOverSquare?: (index: number | null) => void;
}

const getSquareName = (index: number) => {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index & 7));
  const rank = String.fromCharCode('1'.charCodeAt(0) + (index >> 3));
  return `${file}${rank}` as Square;
};

export const Board: React.FC<BoardProps> = ({
  position, flipped, onSquareClick, selectedSquare, destinationSquare, moves, expandedLevel, exchangeStep, selectedDestInfo,
  focusedSquare = 0, setFocusedSquare, readOnly = false, showBadgesOnReadOnly = false, arrow,
  lastMove, checkSquare, legalDestinations,
  onSquarePointerDown, onSquarePointerUp, onSquarePointerCancel, onSquareMouseEnter, onSquareMouseLeave,
  animateMoves, animationKey, draggableSquares, onPieceDrop, onPieceDragStart, onDragOverSquare
}) => {
  
  const [hasFocus, setHasFocus] = React.useState(false);
  
  // Animation state
  const [animOffsets, setAnimOffsets] = React.useState<Record<number, { dx: number; dy: number }>>({});
  const [transitioning, setTransitioning] = React.useState<Record<number, boolean>>({});
  const [lastAnimKey, setLastAnimKey] = React.useState<string | number | undefined>(undefined);

  React.useLayoutEffect(() => {
    if (animationKey !== undefined && animationKey !== lastAnimKey && animateMoves && animateMoves.length > 0) {
      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (isReducedMotion) {
        setLastAnimKey(animationKey);
        setAnimOffsets({});
        setTransitioning({});
        return;
      }
      
      const newOffsets: Record<number, { dx: number; dy: number }> = {};
      const newTrans: Record<number, boolean> = {};
      
      for (const move of animateMoves) {
        const offset = squareOffset(move.from, move.to, flipped);
        newOffsets[move.to] = { dx: -offset.dx * 100, dy: -offset.dy * 100 };
        newTrans[move.to] = false;
      }
      
      setAnimOffsets(newOffsets);
      setTransitioning(newTrans);
      setLastAnimKey(animationKey);
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimOffsets({});
          const activeTrans: Record<number, boolean> = {};
          for (const move of animateMoves) activeTrans[move.to] = true;
          setTransitioning(activeTrans);
          
          setTimeout(() => {
            setTransitioning({});
          }, 180);
        });
      });
    }
  }, [animateMoves, animationKey, lastAnimKey, flipped]);

  // Drag state (Play only: active when draggableSquares/onPieceDrop are passed)
  const boardRef = React.useRef<HTMLDivElement>(null);
  const suppressClickRef = React.useRef(false);
  const [dragState, setDragState] = React.useState<{
    isActive: boolean;
    startIndex: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    hoverIndex: number | null;
    ghostSize: number;
  } | null>(null);

  const squareAt = (x: number, y: number): number | null => {
    const cell = document.elementsFromPoint(x, y).find(el => el.getAttribute('role') === 'gridcell' && el.id.startsWith('sq-') && boardRef.current?.contains(el));
    return cell ? parseInt(cell.id.slice(3), 10) : null;
  };

  const handlePointerDownInternal = (e: React.PointerEvent, index: number) => {
    suppressClickRef.current = false;
    if (onSquarePointerDown) onSquarePointerDown(index, e.pointerType);
    if (e.button !== 0 || readOnly || !onPieceDrop || !draggableSquares?.includes(index)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = boardRef.current?.getBoundingClientRect().width ?? 0;
    setDragState({ isActive: false, startIndex: index, startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY, hoverIndex: null, ghostSize: (width / 8) * 1.1 });
  };

  const handlePointerMoveInternal = (e: React.PointerEvent) => {
    if (!dragState) return;
    const moved = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    if (!dragState.isActive && moved <= 6) return;
    if (!dragState.isActive) {
      if (onSquarePointerCancel) onSquarePointerCancel(dragState.startIndex); // a drag is never a long-press
      if (onPieceDragStart) onPieceDragStart(dragState.startIndex);
    }
    const hoverIndex = squareAt(e.clientX, e.clientY);
    // Report the hovered square outside the state updater (updaters must stay pure), including the first one.
    if (onDragOverSquare && (!dragState.isActive || dragState.hoverIndex !== hoverIndex)) onDragOverSquare(hoverIndex);
    setDragState(prev => prev ? { ...prev, isActive: true, currentX: e.clientX, currentY: e.clientY, hoverIndex } : null);
  };

  const endDrag = (e: React.PointerEvent, drop: boolean) => {
    if (!dragState) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragState.isActive) {
      if (onDragOverSquare) onDragOverSquare(null);
      suppressClickRef.current = true; // the click that follows a drag must not select/deselect
      const dropIndex = drop ? squareAt(e.clientX, e.clientY) : null;
      if (onPieceDrop && dropIndex !== null && dropIndex !== dragState.startIndex) onPieceDrop(dragState.startIndex, dropIndex);
    }
    setDragState(null);
  };

  const handlePointerUpInternal = (e: React.PointerEvent, index: number) => {
    if (onSquarePointerUp) onSquarePointerUp(index);
    endDrag(e, true);
  };

  const handlePointerCancelInternal = (e: React.PointerEvent, index: number) => {
    if (onSquarePointerCancel) onSquarePointerCancel(index);
    endDrag(e, false);
  };

  const displayBoard: Map<number, { role: string, color: string }> = new Map();

  for (let i = 0; i < 64; i++) {
    const p = position.board.get(i);
    if (p) displayBoard.set(i, { role: p.role, color: p.color });
  }

  if (expandedLevel >= 3 && exchangeStep > 0 && selectedDestInfo?.exchange) {
    const setup = fenOps.parseFen(selectedDestInfo.exchange.fenAfter);
    if (setup.isOk) {
      const posAfter = Chess.fromSetup(setup.unwrap()).unwrap();
      displayBoard.clear();
      for (let i = 0; i < 64; i++) {
        const p = posAfter.board.get(i);
        if (p) displayBoard.set(i, { role: p.role, color: p.color });
      }
      
      const toParse = (sq: string) => (sq.charCodeAt(1) - '1'.charCodeAt(0)) * 8 + (sq.charCodeAt(0) - 'a'.charCodeAt(0));
      for (let i = 0; i < exchangeStep; i++) {
        const step = selectedDestInfo.exchange.bestLine[i];
        const fromIdx = toParse(step.capturer.square);
        const toIdx = toParse(step.to);
        const piece = displayBoard.get(fromIdx);
        displayBoard.delete(fromIdx);
        
        if (step.captured && step.captured.square !== step.to) {
          displayBoard.delete(toParse(step.captured.square));
        }
        
        if (piece) {
          if (step.promotion) {
            displayBoard.set(toIdx, { role: step.promotion, color: piece.color });
          } else {
            displayBoard.set(toIdx, piece);
          }
        }
      }
    }
  }

  const attackers = selectedDestInfo?.destination?.geometricAttackers || [];
  const defenders = selectedDestInfo?.destination?.geometricDefenders || [];

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSquareClick) onSquareClick(index);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const currentRank = index >> 3;
      const currentFile = index & 7;
      let nextRank = currentRank;
      let nextFile = currentFile;
      if (e.key === 'ArrowUp') nextRank = flipped ? Math.max(0, currentRank - 1) : Math.min(7, currentRank + 1);
      if (e.key === 'ArrowDown') nextRank = flipped ? Math.min(7, currentRank + 1) : Math.max(0, currentRank - 1);
      if (e.key === 'ArrowLeft') nextFile = flipped ? Math.min(7, currentFile + 1) : Math.max(0, currentFile - 1);
      if (e.key === 'ArrowRight') nextFile = flipped ? Math.max(0, currentFile - 1) : Math.min(7, currentFile + 1);
      const nextIndex = (nextRank << 3) | nextFile;
      if (setFocusedSquare) setFocusedSquare(nextIndex);
      setTimeout(() => {
        const el = document.getElementById(`sq-${nextIndex}`);
        if (el) el.focus();
      }, 0);
    }
  };

  const renderSquare = (rank: number, file: number) => {
    const index = (rank << 3) | file;
    const isLight = (rank + file) % 2 !== 0;
    const sqName = getSquareName(index);
    const piece = displayBoard.get(index);
    const pieceStr = piece ? `${piece.color === 'white' ? 'white' : 'black'} ${piece.role}` : 'empty';
    
    const isSelected = (!readOnly || showBadgesOnReadOnly) && selectedSquare === index;
    const moveInfo = moves.find(m => m.move.to === sqName);
    const isDestination = (!readOnly || showBadgesOnReadOnly) && !!moveInfo;
    const isSelectedDest = (!readOnly || showBadgesOnReadOnly) && destinationSquare === index;

    const isReplaying = expandedLevel >= 3 && exchangeStep > 0;
    const isReplayLandingSquare = isReplaying && sqName === selectedDestInfo?.exchange?.bestLine[exchangeStep - 1]?.to;

    let ariaLabel = `${sqName}, ${pieceStr}`;
    if ((!readOnly || showBadgesOnReadOnly) && !isReplaying && isDestination && moveInfo) {
      const badge = BADGE_INFO[moveInfo.label as keyof typeof BADGE_INFO];
      ariaLabel += `, legal destination, ${badge.text}`;
    } else if (legalDestinations?.includes(index) && !isDestination) {
      ariaLabel += `, legal destination`;
    }
    
    if (checkSquare === index) {
      ariaLabel += `, in check`;
    }

    let marker = '';
    if (!readOnly && !isReplaying && expandedLevel >= 2) {
      const aIndex = attackers.findIndex(a => a.square === sqName);
      if (aIndex !== -1) marker = `A${aIndex + 1}`;
      const dIndex = defenders.findIndex(d => d.square === sqName);
      if (dIndex !== -1) marker = `D${dIndex + 1}`;
    }

    return (
      <div
        id={`sq-${index}`}
        key={index}
        tabIndex={readOnly ? -1 : (index === focusedSquare ? 0 : -1)}
        role="gridcell"
        aria-label={ariaLabel}
        onKeyDown={(e) => handleKeyDown(e, index)}
        onClick={(e) => {
          if (suppressClickRef.current) { suppressClickRef.current = false; e.stopPropagation(); return; }
          if (setFocusedSquare) setFocusedSquare(index);
          if (onSquareClick && !readOnly) onSquareClick(index);
        }}
        onFocus={() => {
          if (setFocusedSquare) setFocusedSquare(index);
          if (onSquareMouseEnter) onSquareMouseEnter(index); // Focus triggers preview
        }}
        onBlur={() => {
          if (onSquareMouseLeave) onSquareMouseLeave(index);
        }}
        onPointerDown={(e) => handlePointerDownInternal(e, index)}
        onPointerUp={(e) => handlePointerUpInternal(e, index)}
        onPointerMove={(e) => handlePointerMoveInternal(e)}
        onPointerCancel={(e) => handlePointerCancelInternal(e, index)}
        onPointerLeave={() => onSquarePointerCancel && onSquarePointerCancel(index)}
        onMouseEnter={() => onSquareMouseEnter && onSquareMouseEnter(index)}
        onMouseLeave={() => onSquareMouseLeave && onSquareMouseLeave(index)}
        style={{
          width: '12.5%',
          height: '12.5%',
          backgroundColor: isLight ? 'var(--board-light)' : 'var(--board-dark)',
          position: 'absolute',
          left: `${(flipped ? 7 - file : file) * 12.5}%`,
          top: `${(flipped ? rank : 7 - rank) * 12.5}%`,
          boxSizing: 'border-box',
          boxShadow: (hasFocus && index === focusedSquare) ? 'inset 0 0 0 3px #ffffff, inset 0 0 0 6px var(--board-ink)' : (isSelected ? 'inset 0 0 0 4px var(--board-ink)' : 'none'),
          border: (dragState?.isActive && dragState.hoverIndex === index) ? '3px solid var(--accent)' : (!isReplaying && isSelectedDest) ? '3px dashed var(--board-ink)' : isReplayLandingSquare ? '3px dashed var(--board-ink)' : 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: readOnly ? 'default' : 'pointer',
          ...(onPieceDrop ? { touchAction: draggableSquares?.includes(index) ? 'none' : 'manipulation' } : {})
        }}
      >
        {isReplayLandingSquare && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--board-last)', pointerEvents: 'none' }} />
        )}
        {lastMove && (lastMove.from === index || lastMove.to === index) && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--board-last)', pointerEvents: 'none' }} />
        )}
        
        {checkSquare === index && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle, rgba(212,92,28,0.65) 0%, rgba(212,92,28,0) 70%)', pointerEvents: 'none' }} />
        )}
        {piece && (
          <div style={{
            width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1,
            transform: animOffsets[index] ? `translate(${animOffsets[index].dx}%, ${animOffsets[index].dy}%)` : 'none',
            transition: transitioning[index] ? 'transform 180ms ease-out' : 'none',
            opacity: dragState?.isActive && dragState.startIndex === index ? 0.3 : 1
          }}>
            <Piece 
              color={piece.color === 'white' ? 'w' : 'b'} 
              type={piece.role === 'pawn' ? 'P' : piece.role === 'knight' ? 'N' : piece.role === 'bishop' ? 'B' : piece.role === 'rook' ? 'R' : piece.role === 'queen' ? 'Q' : 'K'} 
              style={{ width: '80%', height: '80%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            />
          </div>
        )}
        {(!readOnly || showBadgesOnReadOnly) && !isReplaying && isDestination && !piece && (
          <div style={{ width: '20%', height: '20%', borderRadius: '50%', backgroundColor: 'rgba(21, 23, 27, 0.42)', pointerEvents: 'none', zIndex: 2 }} />
        )}
        {legalDestinations?.includes(index) && !isDestination && !piece && (
          <div style={{ width: '20%', height: '20%', borderRadius: '50%', backgroundColor: 'rgba(21, 23, 27, 0.42)', pointerEvents: 'none', zIndex: 2 }} />
        )}
        {(rank === (flipped ? 7 : 0)) && (
          <div aria-hidden="true" className="mono" style={{ position: 'absolute', bottom: 2, right: 4, fontSize: '12px', fontWeight: 600, color: 'var(--board-coord)', zIndex: 0 }}>
            {sqName[0]}
          </div>
        )}
        {(file === (flipped ? 7 : 0)) && (
          <div aria-hidden="true" className="mono" style={{ position: 'absolute', top: 2, left: 4, fontSize: '12px', fontWeight: 600, color: 'var(--board-coord)', zIndex: 0 }}>
            {sqName[1]}
          </div>
        )}
        {(!readOnly || showBadgesOnReadOnly) && !isReplaying && isDestination && piece && (
          <div style={{ position: 'absolute', width: '90%', height: '90%', border: '4px solid rgba(21, 23, 27, 0.42)', borderRadius: '50%', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 2 }} />
        )}
        {legalDestinations?.includes(index) && !isDestination && piece && (
          <div style={{ position: 'absolute', width: '90%', height: '90%', border: '4px solid rgba(21, 23, 27, 0.42)', borderRadius: '50%', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 2 }} />
        )}
        {(!readOnly || showBadgesOnReadOnly) && !isReplaying && isDestination && moveInfo && (
          <div style={{
            position: 'absolute', top: '-4px', right: '-4px', backgroundColor: BADGE_INFO[moveInfo.label as keyof typeof BADGE_INFO].color,
            color: BADGE_INFO[moveInfo.label as keyof typeof BADGE_INFO].textColor, padding: '2px', borderRadius: '6px',
            border: '1.5px solid var(--board-ink)', zIndex: 10, display: 'flex', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            <LabelIcon kind={moveInfo.label as keyof typeof BADGE_INFO} size={14} />
          </div>
        )}
        {!readOnly && marker && (
          <div style={{
            position: 'absolute', bottom: 2, left: 2, backgroundColor: 'var(--panel)',
            color: 'var(--text)', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold', zIndex: 10, border: '1px solid var(--border)'
          }}>
            {marker}
          </div>
        )}
      </div>
    );
  };

  const rows = [];
  for (let rank = 0; rank < 8; rank++) {
    const squaresInRow = [];
    for (let file = 0; file < 8; file++) {
      squaresInRow.push(renderSquare(rank, file));
    }
    rows.push(
      <div key={`row-${rank}`} role="row" style={{ display: 'contents' }}>
        {squaresInRow}
      </div>
    );
  }

  return (
    <div 
      ref={boardRef}
      role="grid" 
      aria-label="Chess board" 
      onFocus={() => setHasFocus(true)} 
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHasFocus(false); }}
      onContextMenu={onSquarePointerDown ? (e) => e.preventDefault() : undefined}
      style={{ position: 'relative', width: '100%', paddingBottom: '100%', outline: '1px solid var(--border-strong)', boxSizing: 'border-box', overflow: 'hidden', borderRadius: '4px', ...(onSquarePointerDown ? { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation' } : {}) }}>
      {rows}

      {dragState?.isActive && (() => {
        const p = displayBoard.get(dragState.startIndex);
        if (!p) return null;
        return (
          <div style={{
            position: 'fixed',
            left: dragState.currentX,
            top: dragState.currentY,
            transform: 'translate(-50%, -50%)',
            width: `${dragState.ghostSize}px`,
            height: `${dragState.ghostSize}px`,
            pointerEvents: 'none',
            zIndex: 1000
          }}>
            <Piece 
              color={p.color === 'white' ? 'w' : 'b'} 
              type={p.role === 'pawn' ? 'P' : p.role === 'knight' ? 'N' : p.role === 'bishop' ? 'B' : p.role === 'rook' ? 'R' : p.role === 'queen' ? 'Q' : 'K'} 
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        );
      })()}

      {readOnly && arrow && (() => {
        const fromFile = arrow.from.charCodeAt(0) - 97;
        const fromRank = arrow.from.charCodeAt(1) - 49;
        const toFile = arrow.to.charCodeAt(0) - 97;
        const toRank = arrow.to.charCodeAt(1) - 49;
        
        const x1 = (flipped ? 7 - fromFile : fromFile) * 12.5 + 6.25;
        const y1 = (flipped ? fromRank : 7 - fromRank) * 12.5 + 6.25;
        const x2 = (flipped ? 7 - toFile : toFile) * 12.5 + 6.25;
        const y2 = (flipped ? toRank : 7 - toRank) * 12.5 + 6.25;
        
        return (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 20 }}>
            <defs>
              <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                <polygon points="0 0, 4 2, 0 4" fill="var(--board-last)" />
              </marker>
            </defs>
            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="var(--board-last)" strokeWidth="3" markerEnd="url(#arrowhead)" />
          </svg>
        );
      })()}
    </div>
  );
};
