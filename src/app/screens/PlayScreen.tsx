import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square, Role } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Board } from '../components/Board.js';
import { Piece } from '../components/Piece.js';
import { explain } from '../explain/explain.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { LabelIcon } from '../components/LabelIcon.js';
import { Spinner } from '../components/Spinner.js';
import { GameState, newGame, legalDestinations, playMove, undo, outcome, previewSan, isPromotionMove, capturedPieces, materialBalance, castlingRookMove } from '../play/game.js';


interface PlayScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
  onNavigate?: (screen: 'home' | 'help' | 'analysis', initialFen?: string) => void;
  game: GameState;
  hintsOn: boolean;
  onGameStateChange: (g: GameState, hintsOn: boolean) => void;
}

import { parseSquare } from 'chessops';

const getPieceName = (c: 'w'|'b', r: string) => {
  const p = r.toLowerCase();
  if (p === 'p') return 'Pawn';
  if (p === 'n') return 'Knight';
  if (p === 'b') return 'Bishop';
  if (p === 'r') return 'Rook';
  if (p === 'q') return 'Queen';
  return 'King';
};

const PROMO_TYPE: Record<string, 'Q' | 'R' | 'B' | 'N'> = { queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' };
const PROMO_NAME: Record<string, string> = { queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight' };

const formatSquare = (index: number) => {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index & 7));
  const rank = String.fromCharCode('1'.charCodeAt(0) + (index >> 3));
  return `${file}${rank}` as Square;
};

export const PlayScreen: React.FC<PlayScreenProps> = ({ engineClient, onNavigate, game, hintsOn, onGameStateChange }) => {
  const [flipped, setFlipped] = useState(false);
  
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [previewSquare, setPreviewSquare] = useState<number | null>(null);
  const [movesInfo, setMovesInfo] = useState<MoveClassification[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  
  
  const [promotionMove, setPromotionMove] = useState<{from: string, to: string} | null>(null);
  const lastActionRef = useRef<'tap'|'drag'|'undo'|'new'>('new');

  
  const requestToken = useRef(0);
  const promoDialogRef = useRef<HTMLDivElement>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreClickRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  // Touch only: a long-press previews a destination without playing it; the click that follows is ignored.
  const handlePointerDown = (index: number, pointerType: string) => {
    ignoreClickRef.current = false;
    clearLongPress();
    if (pointerType !== 'touch') return;
    if (selectedSquare !== null && hintsOn && legalDestinations(game, selectedSquare).includes(index)) {
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        setPreviewSquare(index);
        ignoreClickRef.current = true;
      }, 450);
    }
  };

  const handleMouseEnter = (index: number) => {
    if (selectedSquare !== null && hintsOn && legalDestinations(game, selectedSquare).includes(index)) {
      setPreviewSquare(index);
    }
  };

  const handleMouseLeave = (index: number) => {
    if (previewSquare === index) {
      setPreviewSquare(null);
    }
  };

  const pos = Chess.fromSetup(fenOps.parseFen(game.currentFen).unwrap()).unwrap();
  
  const handlePieceDrop = (from: number, to: number) => {
    if (legalDestinations(game, from).includes(to)) {
      if (isPromotionMove(game, from, to)) {
        setPromotionMove({ from: (String.fromCharCode(97 + (from & 7)) + String.fromCharCode(49 + (from >> 3))), to: (String.fromCharCode(97 + (to & 7)) + String.fromCharCode(49 + (to >> 3))) });
      } else {
        lastActionRef.current = 'drag';
        const next = playMove(game, from, to);
        if (next) onGameStateChange(next, hintsOn);
      }
      setSelectedSquare(null);
      setPreviewSquare(null);
    }
  };




  

  const gameOutcome = outcome(game);
  const readOnly = !!gameOutcome;

  const sideToMoveSquares: number[] = [];
  if (!readOnly && !promotionMove) {
    for (let i = 0; i < 64; i++) {
      const p = pos.board.get(i);
      if (p && p.color === pos.turn) sideToMoveSquares.push(i);
    }
  }

  let animateMoves: { from: number; to: number }[] = [];
  let animationKey: number | undefined = undefined;
  if (lastActionRef.current === 'tap' && game.moves.length > 0) {
    const lastGameMove = game.moves[game.moves.length - 1];
    const fromStr = lastGameMove.uci.slice(0, 2);
    const toStr = lastGameMove.uci.slice(2, 4);
    const fromSq = (fromStr.charCodeAt(0) - 97) + (fromStr.charCodeAt(1) - 49) * 8;
    const toSq = (toStr.charCodeAt(0) - 97) + (toStr.charCodeAt(1) - 49) * 8;
    const castling = castlingRookMove(fromSq, toSq);
    animateMoves = castling ? [{ from: fromSq, to: toSq }, castling] : [{ from: fromSq, to: toSq }];
    animationKey = game.moves.length;
  }

  

  // Moves list info (storing move classifications for dot rendering)
  const [moveListInfo, setMoveListInfo] = useState<Record<number, MoveClassification>>({});
  const moveTokens = useRef<Record<number, number>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (promotionMove) {
          setPromotionMove(null);
        } else {
          resetSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promotionMove]);

  // Handle focus for promotion dialog
  useEffect(() => {
    if (promotionMove && promoDialogRef.current) {
      promoDialogRef.current.focus();
    }
  }, [promotionMove]);

  useEffect(() => {
    const i = game.moves.length - 1;
    if (!hintsOn || i < 0 || moveTokens.current[i] !== undefined) return;
    const m = game.moves[i];
    if (m.uci.length > 4 && m.uci[4] !== 'q') return;
    moveTokens.current[i] = -1;
    engineClient.classifyMove(undo(game).currentFen, { from: m.uci.slice(0, 2) as Square, to: m.uci.slice(2, 4) as Square, promotion: m.uci.length > 4 ? 'queen' : undefined }).then(res => {
      if (moveTokens.current[i] === -1 && res.ok) setMoveListInfo(prev => ({ ...prev, [i]: res.value }));
    }).catch(() => {});
  }, [game, hintsOn, engineClient]);

  const resetSelection = () => {
    requestToken.current++;
    setSelectedSquare(null);
    setPreviewSquare(null);
    setMovesInfo([]);
    setAnalyzing(false);
  };

  const handleSquareClick = (index: number) => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (readOnly) return;
    
    if (promotionMove) return; // Wait for dialog
    
    const sqName = formatSquare(index);

    if (selectedSquare === null) {
      const piece = pos.board.get(index);
      if (piece && piece.color === pos.turn) {
        setSelectedSquare(index);
        setPreviewSquare(null);
        
        if (hintsOn) {
          setAnalyzing(true);
          const token = ++requestToken.current;
          engineClient.classifyMovesFrom(game.currentFen, sqName).then(result => {
            if (token === requestToken.current && result) {
              setMovesInfo(result.ok ? result.value : []);
              setAnalyzing(false);
            }
          }).catch(() => {
            if (token === requestToken.current) setAnalyzing(false);
          });
        }
      }
    } else {
      if (index === selectedSquare) {
        resetSelection();
        return;
      }
      
      const isLegal = legalDestinations(game, selectedSquare).includes(index);
      if (!isLegal) {
        resetSelection();
        const piece = pos.board.get(index);
        if (piece && piece.color === pos.turn) {
          handleSquareClick(index); // select new piece
        }
        return;
      }

      executeMove(selectedSquare, index);
    }
  };

  const executeMove = (fromIdx: number, toIdx: number, promoRole?: Role) => {
    const fromStr = formatSquare(fromIdx);
    const toStr = formatSquare(toIdx);
    
    // Check if promotion is needed
    const promotes = isPromotionMove(game, fromIdx, toIdx);
    if (!promoRole && promotes) {
      setPromotionMove({ from: fromStr, to: toStr });
      return;
    }
    
    const newGameSt = playMove(game, fromIdx, toIdx, promoRole);
    if (newGameSt) {
      const moveIndex = newGameSt.moves.length - 1;
      const fenBefore = game.currentFen;
      
      onGameStateChange(newGameSt, hintsOn);
      resetSelection();
      setPromotionMove(null);
      
      // The engine analyses queen promotion only: no label for under-promotions.
      if (promotes && promoRole !== 'queen') return;
      const token = ++requestToken.current;
      moveTokens.current[moveIndex] = token;
      // Classify the move to add a dot to the move list
      engineClient.classifyMove(fenBefore, { from: fromStr, to: toStr, promotion: promotes ? 'queen' : undefined }).then(res => {
        if (moveTokens.current[moveIndex] === token && res && res.ok) {
           setMoveListInfo(prev => ({ ...prev, [moveIndex]: res.value }));
        }
      }).catch(() => {});
    }
  };

  const handleUndo = () => {
    const nextGame = undo(game);
    const keep = nextGame.moves.length;
    // Drop labels and pending classification requests for undone moves.
    for (const k of Object.keys(moveTokens.current)) {
      if (Number(k) >= keep) delete moveTokens.current[Number(k)];
    }
    setMoveListInfo(prev => {
      const next: Record<number, MoveClassification> = {};
      for (const [k, v] of Object.entries(prev)) if (Number(k) < keep) next[Number(k)] = v;
      return next;
    });
    setPromotionMove(null);
    onGameStateChange(nextGame, hintsOn);
    resetSelection();
  };

  const handleNewGame = () => {
    if (game.moves.length > 0 && !gameOutcome) {
      if (!window.confirm("Start a new game? The current game will be lost.")) return;
    }
    onGameStateChange(newGame(), hintsOn);
    setMoveListInfo({});
    moveTokens.current = {};
    resetSelection();
    setFlipped(false);
  };


  const caps = capturedPieces(game);
  const matBal = materialBalance(game);
  
  const renderCaptured = (color: 'white' | 'black') => {
    const pieces = caps[color];
    const order: Record<Role, number> = { queen: 1, rook: 2, bishop: 3, knight: 4, pawn: 5, king: 6 };
    pieces.sort((a, b) => order[a] - order[b]);
    
    // count occurrences for aria-label
    const counts: Record<string, number> = {};
    for (const p of pieces) counts[p] = (counts[p] || 0) + 1;
    const labels = Object.entries(counts).map(([p, c]) => `${c} ${c === 1 ? p : `${p}s`}`).join(', ');
    const ariaLabel = pieces.length > 0 ? `Captured: ${labels}` : '';
    
    let isAhead = false;
    let amtAhead = 0;
    if (color === 'white' && matBal > 0) { isAhead = true; amtAhead = matBal; }
    if (color === 'black' && matBal < 0) { isAhead = true; amtAhead = -matBal; }

    if (pieces.length === 0 && !isAhead) return null;

    return (
      <div aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {pieces.map((p, i) => (
          <div key={i} style={{ width: '16px', height: '16px' }} aria-hidden="true">
            {(() => { const tc = color === 'white' ? 'b' : 'w'; const tt = p === 'knight' ? 'N' : p[0].toUpperCase(); return <Piece color={tc as 'w'|'b'} type={tt as 'P'|'N'|'B'|'R'|'Q'|'K'} />; })()}
          </div>
        ))}
        {isAhead && <span style={{ marginLeft: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>+{amtAhead}</span>}
      </div>
    );
  };

  // Status line logic
  let statusText = '';
  if (gameOutcome) {
    if (gameOutcome.reason === 'checkmate') {
      statusText = `Checkmate — ${gameOutcome.winner === 'white' ? 'White' : 'Black'} wins`;
    } else if (gameOutcome.reason === 'stalemate') {
      statusText = 'Stalemate — draw';
    } else if (gameOutcome.reason === 'threefold repetition') {
      statusText = 'Draw by threefold repetition';
    } else if (gameOutcome.reason === 'fifty-move rule') {
      statusText = 'Draw by the fifty-move rule';
    } else if (gameOutcome.reason === 'insufficient material') {
      statusText = 'Draw — insufficient material';
    }
  }
  
  const formatStatusMove = () => {
    if (gameOutcome) return statusText;
    if (game.moves.length === 0) return 'White to move';
    
    if (pos.isCheck()) return 'Check';
    
    const lastMove = game.moves[game.moves.length - 1];
    const colorText = lastMove.color === 'white' ? 'White' : 'Black';
    return `${colorText} ${lastMove.role} ${lastMove.uci.slice(0, 2)} to ${lastMove.uci.slice(2, 4)}`;
  };
  
  const currentStatusText = formatStatusMove();

  const labelChip = (c: MoveClassification) => {
    const b = BADGE_INFO[c.label as keyof typeof BADGE_INFO];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '4px', background: b.color, color: b.textColor, fontSize: '0.8rem', fontWeight: 600 }}>
        <LabelIcon kind={c.label as keyof typeof BADGE_INFO} size={14} />
        {b.text}
      </span>
    );
  };

  const moveDetails = (c: MoveClassification) => {
    const e = explain(c);
    return (
      <>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>{e.primary}</div>
        {e.notes.map((n, i) => <div key={i} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{n}</div>)}
      </>
    );
  };

  const infoFor = (destIdx: number) => movesInfo.find(m => m.move.to === formatSquare(destIdx));

  const renderLastMoveCard = () => {
    const i = game.moves.length - 1;
    if (i < 0) return null;
    const info = moveListInfo[i];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--panel)', borderRadius: '8px', border: '2px solid var(--accent)', padding: '16px' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Last move</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontWeight: 'bold' }}>{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'} {game.moves[i].san}</span>
          {hintsOn && info && labelChip(info)}
        </div>
        {hintsOn && info && moveDetails(info)}
      </div>
    );
  };

  const renderHintPanel = () => {
    if (selectedSquare === null) {
      if (game.moves.length > 0) return renderLastMoveCard();
      if (!hintsOn) return null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Tap one of your pieces to see where it can go.</p>
        </div>
      );
    }
    if (!hintsOn) return null;
    
    const sqName = formatSquare(selectedSquare);
    const piece = pos.board.get(selectedSquare);
    const pieceName = piece ? getPieceName(piece.color === 'white' ? 'w' : 'b', piece.role === 'pawn' ? 'P' : piece.role === 'knight' ? 'N' : piece.role === 'bishop' ? 'B' : piece.role === 'rook' ? 'R' : piece.role === 'queen' ? 'Q' : 'K') : '';
    
    const dests = legalDestinations(game, selectedSquare);
    dests.sort((a, b) => a - b);
    
    if (analyzing) {
       return <div style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)' }}>Checking squares…</div>;
    }
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{pieceName} on {sqName} — where it can go</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
          {dests.map(destIdx => {
            const mInfo = infoFor(destIdx);
            const isPreview = previewSquare === destIdx;
            const san = previewSan(game, selectedSquare, destIdx) ?? formatSquare(destIdx);
            return (
              <div 
                key={destIdx}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px',
                  border: isPreview ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                  borderRadius: '6px', color: 'var(--text)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontWeight: 'bold' }}>{san}</span>
                  {mInfo && labelChip(mInfo)}
                </div>
                {mInfo && moveDetails(mInfo)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPreviewSlot = () => {
    if (!hintsOn) return null;
    const active = selectedSquare !== null && previewSquare !== null;
    const info = active ? infoFor(previewSquare) : undefined;
    const san = active ? previewSan(game, selectedSquare, previewSquare) : null;
    return (
      <div style={{ marginTop: '12px', height: '128px', overflowY: 'auto', boxSizing: 'border-box', padding: '12px', background: 'var(--panel)', borderRadius: '6px', border: active ? '2px solid var(--accent)' : '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {active ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontWeight: 'bold' }}>{san}</span>
              {info && labelChip(info)}
            </div>
            {info && moveDetails(info)}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {selectedSquare === null ? 'Select a piece, then hover, focus, long-press or drag to preview the move.' : 'Hover, focus, long-press or drag a piece to preview the move.'}
          </p>
        )}
      </div>
    );
  };
  
  let checkSquare: number | undefined;
  if (pos.isCheck()) {
    const kingSquares = Array.from(pos.board[pos.turn].intersect(pos.board.king));
    if (kingSquares.length > 0) checkSquare = kingSquares[0];
  }
  
  const lastMoveObj = game.moves.length > 0 ? {
    from: parseSquare(game.moves[game.moves.length - 1].uci.substring(0, 2))!,
    to: parseSquare(game.moves[game.moves.length - 1].uci.substring(2, 4))!
  } : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      
      <div className="mode-bar" style={{ background: 'var(--panel)', color: 'var(--text-muted)', padding: '10px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        PLAY · Two players · Hints {hintsOn ? 'on' : 'off'}
      </div>

      <div className="play-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
        
        {/* Top Controls */}
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg-sunken)', borderRadius: '6px', padding: '4px' }}>
            <button className="rv-hover" aria-pressed="true" style={{ minHeight: '44px', padding: '8px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontWeight: 'bold', cursor: 'default' }}>Two players</button>
            <button className="rv-hover" aria-disabled="true" style={{ minHeight: '44px', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'not-allowed' }}>vs Computer (Coming soon)</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
              <input type="checkbox" checked={hintsOn} onChange={(e) => { onGameStateChange(game, e.target.checked); resetSelection(); }} />
              Show hints
            </label>
            <button className="rv-hover" onClick={handleUndo} disabled={game.moves.length === 0} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: game.moves.length === 0 ? 'var(--text-muted)' : 'var(--text)', cursor: game.moves.length === 0 ? 'not-allowed' : 'pointer' }}>Undo</button>
            <button className="rv-hover" onClick={() => setFlipped(!flipped)} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>Flip board</button>
            <button className="rv-hover" onClick={handleNewGame} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>New game</button>
            <button className="rv-hover" onClick={() => onNavigate?.('analysis', game.currentFen)} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>Open in Analysis</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', width: '100%', maxWidth: '1000px' }}>
          
          <div className="play-board-col" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
            {/* Player strip (opponent) */}
            <div style={{ background: 'var(--panel)', padding: '12px 16px', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', border: '1px solid var(--border)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>{flipped ? 'White' : 'Black'}</span>
              {renderCaptured(flipped ? 'white' : 'black')}
              {pos.turn === (flipped ? 'white' : 'black') && <span style={{ color: 'var(--accent-text)', fontWeight: 'bold' }}>to move</span>}
            </div>
            
            <div style={{ width: '100%', position: 'relative' }}>
              <Board 
                position={pos}
                flipped={flipped}
                selectedSquare={selectedSquare}
                destinationSquare={previewSquare}
                moves={hintsOn && movesInfo.length > 0 ? movesInfo : []}
                expandedLevel={1}
                exchangeStep={0}
                selectedDestInfo={null}
                onSquareClick={handleSquareClick}
                readOnly={readOnly}
                lastMove={lastMoveObj}
                checkSquare={checkSquare}
                legalDestinations={!hintsOn && selectedSquare !== null ? legalDestinations(game, selectedSquare) : undefined}
                onSquarePointerDown={handlePointerDown}
                onSquarePointerUp={clearLongPress}
                onSquarePointerCancel={clearLongPress}
                onSquareMouseEnter={handleMouseEnter}
                onSquareMouseLeave={handleMouseLeave}
                draggableSquares={sideToMoveSquares}
                onPieceDrop={handlePieceDrop}
                animateMoves={animateMoves}
                animationKey={animationKey}
              />
              
              {promotionMove && (
                <div role="dialog" aria-modal="true" ref={promoDialogRef} tabIndex={-1} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ fontWeight: 'bold', textAlign: 'center' }}>Choose promotion</div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map(role => (
                      <button className="rv-hover" key={role} aria-label={PROMO_NAME[role]} onClick={() => executeMove(parseSquare(promotionMove.from)!, parseSquare(promotionMove.to)!, role)} style={{ width: '60px', height: '60px', padding: '6px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                        <Piece color={pos.turn === 'white' ? 'w' : 'b'} type={PROMO_TYPE[role]} style={{ width: '100%', height: '100%' }} />
                      </button>
                    ))}
                    </div>
                    <button className="rv-hover" onClick={() => setPromotionMove(null)} style={{ minHeight: '44px', padding: '12px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Player strip (self) */}
            <div style={{ background: 'var(--panel)', padding: '12px 16px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', border: '1px solid var(--border)', borderTop: 'none', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>{flipped ? 'Black' : 'White'}</span>
              {renderCaptured(flipped ? 'black' : 'white')}
              {pos.turn === (flipped ? 'black' : 'white') && <span style={{ color: 'var(--accent-text)', fontWeight: 'bold' }}>to move</span>}
            </div>
            
            {renderPreviewSlot()}

            {/* Status Line */}
            <div aria-live="polite" style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-sunken)', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold' }}>
              {currentStatusText}
            </div>
          </div>
          
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {gameOutcome && (
              <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--accent)', textAlign: 'center' }}>
                <h2>Game Over</h2>
                <p style={{ fontSize: '1.2rem', marginBottom: '16px' }}>{statusText}</p>
                <button className="rv-hover" onClick={handleNewGame} style={{ minHeight: '44px', padding: '8px 24px', background: 'var(--accent-btn)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>New game</button>
              </div>
            )}
            
            {renderHintPanel()}
            
            <div style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px', flex: 1, minHeight: '200px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Moves</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {game.moves.map((move, i) => {
                  const mInfo = moveListInfo[i];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-sunken)', padding: '4px 8px', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{i % 2 === 0 ? `${i / 2 + 1}.` : ''}</span>
                      <span className="mono" style={{ fontWeight: 'bold' }}>{move.san}</span>
                      {mInfo && (
                        <div title={BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO].text} aria-label={BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO].text} style={{ width: '8px', height: '8px', borderRadius: '50%', background: BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO].color }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
