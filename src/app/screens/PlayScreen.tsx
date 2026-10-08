import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square, Role } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Board } from '../components/Board.js';
import { explain } from '../explain/explain.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { LabelIcon } from '../components/LabelIcon.js';
import { GameState, newGame, legalDestinations, playMove, undo, outcome } from '../play/game.js';


interface PlayScreenProps {
  engineClient: EngineClient;
  onNavigate?: (screen: 'home' | 'help' | 'analysis', initialFen?: string) => void;
}

import { parseSquare } from 'chessops';
import { makeSan } from 'chessops/san';

const getPieceName = (c: 'w'|'b', r: string) => {
  const p = r.toLowerCase();
  if (p === 'p') return 'Pawn';
  if (p === 'n') return 'Knight';
  if (p === 'b') return 'Bishop';
  if (p === 'r') return 'Rook';
  if (p === 'q') return 'Queen';
  return 'King';
};

const formatSquare = (index: number) => {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index & 7));
  const rank = String.fromCharCode('1'.charCodeAt(0) + (index >> 3));
  return `${file}${rank}` as Square;
};

export const PlayScreen: React.FC<PlayScreenProps> = ({ engineClient, onNavigate }) => {
  const [game, setGame] = useState<GameState>(() => newGame());
  const [hintsOn, setHintsOn] = useState(true);
  const [flipped, setFlipped] = useState(false);
  
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [previewSquare, setPreviewSquare] = useState<number | null>(null);
  const [movesInfo, setMovesInfo] = useState<MoveClassification[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  
  const [promotionMove, setPromotionMove] = useState<{from: string, to: string} | null>(null);
  
  const requestToken = useRef(0);
  const promoDialogRef = useRef<HTMLDivElement>(null);

  const pos = Chess.fromSetup(fenOps.parseFen(game.currentFen).unwrap()).unwrap();
  const gameOutcome = outcome(game);
  const readOnly = !!gameOutcome;

  // Moves list info (storing move classifications for dot rendering)
  const [moveListInfo, setMoveListInfo] = useState<Record<number, MoveClassification>>({});
  const moveToken = useRef(0);

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

  const resetSelection = () => {
    requestToken.current++;
    setSelectedSquare(null);
    setPreviewSquare(null);
    setMovesInfo([]);
    setAnalyzing(false);
  };

  const handleSquareClick = (index: number) => {
    if (readOnly && !selectedSquare) return;
    
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

      if (hintsOn && previewSquare !== index) {
        setPreviewSquare(index);
        return;
      }
      
      executeMove(selectedSquare, index);
    }
  };

  const executeMove = (fromIdx: number, toIdx: number, promoRole?: Role) => {
    const fromStr = formatSquare(fromIdx);
    const toStr = formatSquare(toIdx);
    const piece = pos.board.get(fromIdx);
    
    // Check if promotion is needed
    if (!promoRole && piece?.role === 'pawn' && (toIdx >> 3 === 0 || toIdx >> 3 === 7)) {
      setPromotionMove({ from: fromStr, to: toStr });
      return;
    }
    
    const newGameSt = playMove(game, fromIdx, toIdx, promoRole);
    if (newGameSt) {
      const moveIndex = newGameSt.moves.length - 1;
      const fenBefore = game.currentFen;
      
      setGame(newGameSt);
      resetSelection();
      setPromotionMove(null);
      
      const token = ++moveToken.current;
      // Classify the move to add a dot to the move list
      engineClient.classifyMove(fenBefore, { from: fromStr, to: toStr, promotion: promoRole || (piece?.role === 'pawn' ? 'queen' : undefined) }).then(res => {
        if (token === moveToken.current && res && res.ok) {
           setMoveListInfo(prev => ({ ...prev, [moveIndex]: res.value }));
        }
      }).catch(() => {});
    }
  };

  const handleUndo = () => {
    setGame(undo(game));
    resetSelection();
  };

  const handleNewGame = () => {
    if (game.moves.length > 0 && !gameOutcome) {
      if (!window.confirm("Start a new game? The current game will be lost.")) return;
    }
    setGame(newGame());
    setMoveListInfo({});
    resetSelection();
    setFlipped(false);
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
    
    const newMoves = game.moves.slice(0, -1);
    const prevPos = Chess.fromSetup(fenOps.parseFen(game.startFen).unwrap()).unwrap();
    for (const m of newMoves) {
      const pPromo = m.uci.length > 4 ? m.uci[4] : undefined;
      const pR = pPromo === 'q' ? 'queen' : pPromo === 'r' ? 'rook' : pPromo === 'b' ? 'bishop' : pPromo === 'n' ? 'knight' : undefined;
      prevPos.play({ from: parseSquare(m.uci.substring(0, 2))!, to: parseSquare(m.uci.substring(2, 4))!, promotion: pR });
    }
    
    const lastMove = game.moves[game.moves.length - 1];
    const fromStr = lastMove.uci.substring(0, 2);
    const toStr = lastMove.uci.substring(2, 4);
    const fromIdx = parseSquare(fromStr)!;
        const p = prevPos.board.get(fromIdx);
    
    if (p) {
      const colorText = p.color === 'white' ? 'White' : 'Black';
      return `${colorText} ${p.role} ${fromStr} to ${toStr}`;
    }
    return lastMove.san;
  };
  
  const currentStatusText = formatStatusMove();

  const renderHintPanel = () => {
    if (!hintsOn) return null;
    if (selectedSquare === null) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Tap one of your pieces to see where it can go.</p>
        </div>
      );
    }
    
    const sqName = formatSquare(selectedSquare);
    const piece = pos.board.get(selectedSquare);
    const pieceName = piece ? getPieceName(piece.color === 'white' ? 'w' : 'b', piece.role === 'pawn' ? 'P' : piece.role === 'knight' ? 'N' : piece.role === 'bishop' ? 'B' : piece.role === 'rook' ? 'R' : piece.role === 'queen' ? 'Q' : 'K') : '';
    
    const dests = legalDestinations(game, selectedSquare);
    dests.sort((a, b) => a - b);
    
    if (analyzing) {
       return <div style={{ padding: '16px', background: 'var(--panel)' }}>Analyzing...</div>;
    }
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{pieceName} on {sqName} — where it can go</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
          {dests.map(destIdx => {
            const destStr = formatSquare(destIdx);
            const mInfo = movesInfo.find(m => m.move.to === destStr);
            const isPreview = previewSquare === destIdx;
            
            // To figure out SAN, we need a legal move
            const legalMove = pos.dests(selectedSquare).has(destIdx) ? { from: selectedSquare, to: destIdx } : undefined;
            let sanMoveString: string = destStr;
            if (legalMove) {
              try { sanMoveString = makeSan(pos, legalMove); } catch { /* ignore */ }
            }
            
            return (
              <button 
                key={destIdx}
                onClick={() => isPreview ? executeMove(selectedSquare, destIdx) : setPreviewSquare(destIdx)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', textAlign: 'left',
                  border: isPreview ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                  borderRadius: '6px', cursor: 'pointer', background: isPreview ? 'rgba(255,255,255,0.05)' : 'transparent', color: 'var(--text)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: 'bold' }}>To {destStr} ({sanMoveString})</span>
                  {mInfo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO].textColor }}>
                      <LabelIcon kind={mInfo.label as keyof typeof BADGE_INFO} size={14} />
                      {BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO].text}
                    </div>
                  )}
                </div>
                {mInfo && (
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
                    {explain(mInfo).primary}
                  </div>
                )}
                {isPreview && (
                  <div style={{ marginTop: '8px', background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', textAlign: 'center' }}>
                    Play {sanMoveString}
                  </div>
                )}
              </button>
            );
          })}
        </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      
      <div className="mode-bar" style={{ background: 'var(--panel)', color: 'var(--text-muted)', padding: '10px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        PLAY · Two players · Hints {hintsOn ? 'on' : 'off'}
      </div>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', overflowY: 'auto' }}>
        
        {/* Top Controls */}
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', background: 'var(--bg-sunken)', borderRadius: '6px', padding: '4px' }}>
            <button aria-pressed="true" style={{ minHeight: '44px', padding: '8px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontWeight: 'bold', cursor: 'default' }}>Two players</button>
            <button aria-disabled="true" style={{ minHeight: '44px', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'not-allowed' }}>vs Computer (Coming soon)</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
              <input type="checkbox" checked={hintsOn} onChange={(e) => { setHintsOn(e.target.checked); resetSelection(); }} />
              Show hints
            </label>
            <button onClick={handleUndo} disabled={game.moves.length === 0} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: game.moves.length === 0 ? 'var(--text-muted)' : 'var(--text)', cursor: game.moves.length === 0 ? 'not-allowed' : 'pointer' }}>Undo</button>
            <button onClick={() => setFlipped(!flipped)} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>Flip board</button>
            <button onClick={handleNewGame} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>New game</button>
            <button onClick={() => onNavigate?.('analysis', game.currentFen)} style={{ minHeight: '44px', padding: '0 16px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>Open in Analysis</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', width: '100%', maxWidth: '1000px' }}>
          
          <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
            {/* Player strip (opponent) */}
            <div style={{ background: 'var(--panel)', padding: '12px 16px', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', border: '1px solid var(--border)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>{flipped ? 'White' : 'Black'}</span>
              {pos.turn === (flipped ? 'white' : 'black') && <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>to move</span>}
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
              />
              
              {promotionMove && (
                <div role="dialog" aria-modal="true" ref={promoDialogRef} tabIndex={-1} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
                    {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map(role => (
                      <button key={role} onClick={() => executeMove(parseSquare(promotionMove.from)!, parseSquare(promotionMove.to)!, role)} style={{ minHeight: '44px', padding: '12px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text)', textTransform: 'capitalize' }}>
                        {role}
                      </button>
                    ))}
                    <button onClick={() => setPromotionMove(null)} style={{ minHeight: '44px', padding: '12px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Player strip (self) */}
            <div style={{ background: 'var(--panel)', padding: '12px 16px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', border: '1px solid var(--border)', borderTop: 'none', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>{flipped ? 'Black' : 'White'}</span>
              {pos.turn === (flipped ? 'black' : 'white') && <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>to move</span>}
            </div>
            
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
                <button onClick={handleNewGame} style={{ minHeight: '44px', padding: '8px 24px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>New game</button>
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
      </main>
    </div>
  );
};
