import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Piece } from '../components/Piece.js';
import { explain } from '../explain/explain.js';

interface AnalysisScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
  onNavigate?: (screen: 'home' | 'help' | 'analysis') => void;
}

const SAMPLES = [
  { name: 'Starting position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'Position 1', fen: 'k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1' },
  { name: 'Position 2', fen: '7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1' },
  { name: 'Position 3', fen: '4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1' },
  { name: 'Position 4', fen: '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' },
  { name: 'Position 5', fen: '3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1' }
];

export const BADGE_INFO = {
  safe: { icon: '✓', text: 'Safe', meaning: 'No immediate material or tactical problem was found. It does not mean this is the best move.', color: '#2e7d32', textColor: '#ffffff' },
  even_trade: { icon: '⇄', text: 'Even trade', meaning: 'Your piece can be taken, but you win back the same value.', color: '#1565c0', textColor: '#ffffff' },
  loses_material: { icon: '⚠', text: 'Loses material', meaning: 'This move loses material or allows a tactic against you right away.', color: '#c62828', textColor: '#ffffff' },
  unclear: { icon: '?', text: 'Unclear', meaning: 'This needs deeper calculation than this trainer does — check it yourself.', color: '#f57f17', textColor: '#000000' },
} as const;

export const AnalysisScreen: React.FC<AnalysisScreenProps> = ({ engineClient, initialFen, onNavigate }) => {
  const initSetup = initialFen ? fenOps.parseFen(initialFen) : null;
  const initPos = initSetup?.isOk ? Chess.fromSetup(initSetup.unwrap()).unwrap() : null;

  const [fen, setFen] = useState(initialFen || '');
  const [inputFen, setInputFen] = useState(initialFen || '');
  const [validFen, setValidFen] = useState(!!initPos || !initialFen);
  const [position, setPosition] = useState<Chess | null>(initPos);

  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalyzingIndicator, setShowAnalyzingIndicator] = useState(false);
  const [moves, setMoves] = useState<MoveClassification[]>([]);
  const [engineError, setEngineError] = useState(false);
  const [destinationSquare, setDestinationSquare] = useState<number | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [flipped, setFlipped] = useState(false);
  const [focusedSquare, setFocusedSquare] = useState<number>(0);
  const [expandedLevel, setExpandedLevel] = useState<number>(1);
  const [exchangeStep, setExchangeStep] = useState<number>(0);
  
  const analyzingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestToken = useRef(0);

  useEffect(() => {
    return () => {
      if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  const resetSelection = () => {
    requestToken.current++;
    setSelectedSquare(null);
    setDestinationSquare(null);
    setMoves([]);
    setResultMessage('');
    setEngineError(false);
    setAnalyzing(false);
    setShowAnalyzingIndicator(false);
    setExpandedLevel(1);
    setExchangeStep(0);
    if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetSelection();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    resetSelection();
    
    if (fen) {
      const setup = fenOps.parseFen(fen);
      if (setup.isOk) {
        const posRes = Chess.fromSetup(setup.unwrap());
        if (posRes.isOk) {
          const newPos = posRes.unwrap();
          setPosition(newPos);
          setValidFen(true);
          setFlipped(newPos.turn === 'black');
        } else {
          setValidFen(false);
          setPosition(null);
        }
      } else {
        setValidFen(false);
        setPosition(null);
      }
    } else {
      setPosition(null);
      setValidFen(true);
    }
  }, [fen]);

  const handleFenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputFen(e.target.value);
    setFen(e.target.value);
  };

  const getSquareName = (index: number) => {
    const file = String.fromCharCode('a'.charCodeAt(0) + (index & 7));
    const rank = String.fromCharCode('1'.charCodeAt(0) + (index >> 3));
    return `${file}${rank}`;
  };

  const onSquareClick = async (index: number) => {
    if (!position) return;
    const piece = position.board.get(index);
    const color = piece ? piece.color : null;
    const turn = position.turn;

    // If a destination is currently selected, clicking anything resets or selects new
    if (destinationSquare !== null) {
      setDestinationSquare(null);
    }

    if (color === turn) {
      // F6: tap again to cancel
      if (selectedSquare === index) {
        resetSelection();
        return;
      }
      // Select own piece
      setSelectedSquare(index);
      setEngineError(false);
      setDestinationSquare(null);
      setMoves([]);
      setAnalyzing(true);
      setShowAnalyzingIndicator(false);
      const currentToken = ++requestToken.current;

      if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
      analyzingTimer.current = setTimeout(() => {
        setShowAnalyzingIndicator(true);
      }, 150);

      const algSquare = getSquareName(index) as Square;
      try {
        const res = await engineClient.classifyMovesFrom(fen, algSquare);
        if (requestToken.current !== currentToken) return;
        if (res.ok) {
          setMoves(res.value);
        } else {
          if (res.error && res.error.code === 'ILLEGAL_MOVE') {
            setMoves([]);
          } else {
            setEngineError(true);
          }
        }
      } catch {
        if (requestToken.current !== currentToken) return;
        setEngineError(true);
      } finally {
        if (requestToken.current === currentToken) {
          setAnalyzing(false);
          setShowAnalyzingIndicator(false);
          if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
        }
      }
    } else if (selectedSquare !== null) {
      // Selected a destination?
      const targetAlg = getSquareName(index);
      const isLegal = moves.find(m => m.move.to === targetAlg);
      if (isLegal) {
        setDestinationSquare(index);
        setExpandedLevel(1);
        setExchangeStep(0);
      } else {
        setResultMessage("That square isn't a legal move for this piece.");
        if (messageTimer.current) clearTimeout(messageTimer.current);
        messageTimer.current = setTimeout(() => setResultMessage(''), 3000);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSquareClick(index);
    } else if (e.key === 'Escape') {
      setSelectedSquare(null);
      setDestinationSquare(null);
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
      setFocusedSquare(nextIndex);
      // Wait for render to update tabIndex, then focus
      setTimeout(() => {
        const el = document.getElementById(`sq-${nextIndex}`);
        if (el) el.focus();
      }, 0);
    }
  };

  const selectedDestInfo = destinationSquare !== null ? moves.find(m => m.move.to === getSquareName(destinationSquare)) : null;
  const explanation = selectedDestInfo ? explain(selectedDestInfo) : null;

  let displayBoard: Map<number, { role: string, color: string }> | null = null;
  if (position) {
    displayBoard = new Map();
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
        for (let i = 0; i < exchangeStep - 1; i++) {
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
  }

  const attackers = selectedDestInfo?.destination?.geometricAttackers || [];
  const defenders = selectedDestInfo?.destination?.geometricDefenders || [];

  const renderSquare = (rank: number, file: number) => {
    const index = (rank << 3) | file;
    const isLight = (rank + file) % 2 !== 0;
    const sqName = getSquareName(index);
    const piece = displayBoard?.get(index);
    const pieceStr = piece ? `${piece.color === 'white' ? 'white' : 'black'} ${piece.role}` : 'empty';
    
    const isSelected = selectedSquare === index;
    const moveInfo = moves.find(m => m.move.to === sqName);
    const isDestination = !!moveInfo;
    const isSelectedDest = destinationSquare === index;

    let ariaLabel = `${sqName}, ${pieceStr}`;
    if (isDestination && moveInfo) {
      const badge = BADGE_INFO[moveInfo.label];
      ariaLabel += `, legal destination, ${badge.text}`;
    }

    let marker = '';
    if (expandedLevel >= 2) {
      const aIndex = attackers.findIndex(a => a.square === sqName);
      if (aIndex !== -1) marker = `A${aIndex + 1}`;
      const dIndex = defenders.findIndex(d => d.square === sqName);
      if (dIndex !== -1) marker = `D${dIndex + 1}`;
    }

    return (
      <div
        id={`sq-${index}`}
        key={index}
        tabIndex={index === focusedSquare ? 0 : -1}
        role="gridcell"
        aria-label={ariaLabel}
        onKeyDown={(e) => handleKeyDown(e, index)}
        onClick={() => {
          setFocusedSquare(index);
          onSquareClick(index);
        }}
        onFocus={() => setFocusedSquare(index)}
        style={{
          width: '12.5%',
          height: '12.5%',
          backgroundColor: isLight ? '#f0d9b5' : '#b58863',
          position: 'absolute',
          left: `${(flipped ? 7 - file : file) * 12.5}%`,
          top: `${(flipped ? rank : 7 - rank) * 12.5}%`,
          boxSizing: 'border-box',
          border: isSelected ? '3px solid #333' : isSelectedDest ? '3px dashed #1a1a1a' : 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        {piece && (
          <Piece 
            color={piece.color === 'white' ? 'w' : 'b'} 
            type={piece.role === 'pawn' ? 'P' : piece.role === 'knight' ? 'N' : piece.role === 'bishop' ? 'B' : piece.role === 'rook' ? 'R' : piece.role === 'queen' ? 'Q' : 'K'} 
            style={{ width: '80%', height: '80%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          />
        )}
        {isDestination && !piece && (
          <div style={{ width: '20%', height: '20%', borderRadius: '50%', backgroundColor: '#222', border: '2px solid #fff' }} />
        )}
        {(rank === (flipped ? 7 : 0)) && (
          <div aria-hidden="true" style={{ position: 'absolute', bottom: 2, right: 2, fontSize: '10px', color: isLight ? '#4a3219' : '#1a1109' }}>
            {getSquareName(index)[0]}
          </div>
        )}
        {(file === (flipped ? 7 : 0)) && (
          <div aria-hidden="true" style={{ position: 'absolute', top: 2, left: 2, fontSize: '10px', color: isLight ? '#4a3219' : '#1a1109' }}>
            {getSquareName(index)[1]}
          </div>
        )}
        {isDestination && piece && (
          <div style={{ position: 'absolute', width: '90%', height: '90%', border: '3px dashed #1a1a1a', borderRadius: '50%', boxSizing: 'border-box' }} />
        )}
        {isDestination && moveInfo && (
          <div style={{
            position: 'absolute', top: 2, right: 2, backgroundColor: BADGE_INFO[moveInfo.label].color,
            color: BADGE_INFO[moveInfo.label].textColor, fontSize: '10px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold',
            border: '1px solid #000', zIndex: 10
          }}>
            {BADGE_INFO[moveInfo.label].icon}
          </div>
        )}
        {marker && (
          <div style={{
            position: 'absolute', bottom: 2, left: 2, backgroundColor: '#333',
            color: '#fff', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold', zIndex: 10
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

  let stepText = '';
  if (expandedLevel >= 3 && exchangeStep > 0 && selectedDestInfo?.exchange) {
    const step = selectedDestInfo.exchange.bestLine[exchangeStep - 1];
    stepText = `Step ${exchangeStep} of ${selectedDestInfo.exchange.bestLine.length}: ${step.side === 'white' ? 'White' : 'Black'} ${step.capturer.role} on ${step.capturer.square} takes ${step.captured.role} on ${step.captured.square}${step.promotion ? ' and becomes a queen' : ''}${step.givesCheck ? ' — check' : ''}.`;
  }

  let liveText = '';
  if (stepText) {
    liveText = stepText;
  } else if (selectedDestInfo && explanation) {
    liveText = `${BADGE_INFO[selectedDestInfo.label].text}. ${explanation.primary}`;
  } else if (engineError) {
    liveText = "We couldn't analyze this move. Try another square.";
  } else if (resultMessage) {
    liveText = resultMessage;
  } else if (selectedSquare !== null && moves.length === 0 && !analyzing && !engineError) {
    liveText = "This piece has no legal moves.";
  } else if (selectedSquare !== null && moves.length > 0 && destinationSquare === null) {
    liveText = "Tap a square to see why.";
  } else if (selectedSquare === null && !resultMessage) {
    liveText = "Tap one of your pieces to check where it can go.";
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <div aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {liveText}
      </div>
      <header style={{ padding: '10px', background: '#eee', display: 'flex', justifyContent: 'space-between' }}>
        <strong>Chess Training System</strong>
        {onNavigate && <button onClick={() => onNavigate('home')}>Home</button>}
      </header>
      <div style={{ background: '#333', color: '#fff', padding: '10px', textAlign: 'center' }}>
        ANALYSIS · Results are shown immediately
      </div>
      
      {!position && (
        <div style={{ padding: '20px' }}>
          <h3>Select a position</h3>
          <ul>
            {SAMPLES.map((s, i) => (
              <li key={i}><button onClick={() => { resetSelection(); setFen(s.fen); }}>{s.name}</button></li>
            ))}
          </ul>
          <div>
            <input type="text" value={inputFen} onChange={handleFenChange} placeholder="Paste FEN here" style={{ width: '300px' }} />
            {!validFen && <div style={{ color: '#333' }}>This position isn't valid. Check the FEN.</div>}
          </div>
        </div>
      )}

      {position && (
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, padding: '4px' }}>
          <div style={{ flex: '1 1 352px', maxWidth: '600px', margin: '0 auto' }}>
            <div role="grid" aria-label="Chess board" style={{ position: 'relative', width: '100%', paddingBottom: '100%', outline: '1px solid #ccc', boxSizing: 'border-box' }}>
              {rows}
            </div>
            
            <div style={{ marginTop: '10px', minHeight: '30px' }}>
              <div aria-hidden="true">{liveText}</div>
              {showAnalyzingIndicator && <div aria-hidden="true">Checking moves…</div>}
            </div>
            
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setFlipped(!flipped)}>Flip Board</button>
              <button onClick={() => { resetSelection(); setFen(''); setInputFen(''); }}>Change position</button>
              {onNavigate && <button onClick={() => onNavigate('help')} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>What do the labels mean?</button>}
            </div>
          </div>
          
          <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', margin: '4px' }}>
            {selectedDestInfo && explanation ? (
              <div>
                <h2>{BADGE_INFO[selectedDestInfo.label].text} <span style={{ fontSize: '24px' }}>{BADGE_INFO[selectedDestInfo.label].icon}</span></h2>
                <p><strong>{explanation.primary}</strong></p>
                
                {expandedLevel >= 2 && (
                  <div style={{ marginTop: '20px' }}>
                    {explanation.details.map((d, i) => <p key={`detail-${i}`}>{d}</p>)}
                    {explanation.notes.map((n, i) => <p key={`note-${i}`}><em>{n}</em></p>)}
                    
                    <div style={{ marginTop: '10px' }}>
                      <strong>Attackers:</strong> {attackers.length === 0 ? 'None' : attackers.map((a, i) => `A${i+1} (${a.color} ${a.role} on ${a.square})`).join(', ')}
                    </div>
                    <div>
                      <strong>Defenders:</strong> {defenders.length === 0 ? 'None' : defenders.map((d, i) => {
                        let status = '';
                        if (selectedDestInfo.reasons.some(r => r.code === 'PINNED_DEFENDER' && r.squares?.includes(d.square))) status = " (can't take back — pinned)";
                        else if (selectedDestInfo.reasons.some(r => r.code === 'KING_CANNOT_RECAPTURE' && r.squares?.includes(d.square))) status = " (king can't take back)";
                        else if (selectedDestInfo.reasons.some(r => r.code === 'DEFENDER_UNAVAILABLE' && r.squares?.includes(d.square))) status = " (can't take back)";
                        return `D${i+1} (${d.color} ${d.role} on ${d.square})${status}`;
                      }).join(', ')}
                    </div>
                  </div>
                )}
                
                {expandedLevel >= 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && (
                  <div style={{ marginTop: '20px', padding: '10px', background: '#eef' }}>
                    <strong>Exchange:</strong>
                    <div style={{ marginTop: '5px' }}>
                      <button onClick={() => setExchangeStep(0)} disabled={exchangeStep === 0}>Back to position</button>
                      <button onClick={() => setExchangeStep(Math.max(1, exchangeStep - 1))} disabled={exchangeStep <= 1}>Prev</button>
                      <button onClick={() => setExchangeStep(Math.min(selectedDestInfo.exchange!.bestLine.length, exchangeStep + 1))} disabled={exchangeStep === selectedDestInfo.exchange!.bestLine.length}>Next</button>
                    </div>
                    {exchangeStep > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <div>{stepText}</div>
                        <div>Balance: {selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter === 0 ? '0' : (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter > 0 ? '+' : '') + (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter / 100)}</div>
                      </div>
                    )}
                  </div>
                )}

                {expandedLevel >= 4 && (
                  <div style={{ marginTop: '20px', fontSize: '12px', background: '#333', color: '#fff', padding: '10px' }}>
                    <strong>Advanced:</strong>
                    <div>Net material: {selectedDestInfo.netMaterial / 100} pawns</div>
                    <div>Reasons: {selectedDestInfo.reasons.map(r => r.code).join(', ')}</div>
                    {selectedDestInfo.exchange && (
                      <>
                        <div>Material from move: {selectedDestInfo.exchange.materialFromMove / 100}</div>
                        <div>SEE: {selectedDestInfo.exchange.see / 100}</div>
                      </>
                    )}
                  </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {expandedLevel < 2 && <button onClick={() => setExpandedLevel(2)}>Show why</button>}
                  {expandedLevel < 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && <button onClick={() => setExpandedLevel(3)}>Show the exchange</button>}
                  {expandedLevel < 4 && <button onClick={() => setExpandedLevel(4)}>Advanced</button>}
                </div>
              </div>
            ) : (
              <div>Results appear here after you choose a destination.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
