import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Board } from '../components/Board.js';
import { ResultPanel } from '../components/ResultPanel.js';
import { getStepText } from '../shared/exchange.js';
import { ExchangeControls } from '../shared/ExchangeControls.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { explain } from '../explain/explain.js';

import { Spinner } from '../components/Spinner.js';

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

export const AnalysisScreen: React.FC<AnalysisScreenProps> = ({ engineClient, initialFen }) => {
  const initSetup = initialFen ? fenOps.parseFen(initialFen) : null;
  const initPos = initSetup?.isOk ? Chess.fromSetup(initSetup.unwrap()).unwrap() : null;

  const [fen, setFen] = useState(initialFen || '');
  const [showMovesFor, setShowMovesFor] = useState<'white'|'black'>(initPos ? initPos.turn : 'white');
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
          setShowMovesFor(newPos.turn);
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


  const getEffectiveFen = () => {
    if (!position || showMovesFor === position.turn) return fen;
    const setup = position.toSetup();
    setup.turn = showMovesFor;
    setup.epSquare = undefined;
    return fenOps.makeFen(setup);
  };

  const onSquareClick = async (index: number) => {
    if (!position) return;
    const piece = position.board.get(index);
    const color = piece ? piece.color : null;
    
    // If a destination is currently selected, clicking anything resets or selects new
    if (destinationSquare !== null) {
      setDestinationSquare(null);
    }

    if (color === showMovesFor) {
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
        const effectiveFen = getEffectiveFen();
        const res = await engineClient.classifyMovesFrom(effectiveFen, algSquare);
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


  const canSwitchTo = (targetColor: 'white'|'black') => {
    if (!position) return false;
    if (position.turn === targetColor) return true;
    const setup = position.toSetup();
    setup.turn = targetColor;
    setup.epSquare = undefined;
    const testFen = fenOps.makeFen(setup);
    const testSetup = fenOps.parseFen(testFen);
    if (!testSetup.isOk) return false;
    const posRes = Chess.fromSetup(testSetup.unwrap());
    return posRes.isOk;
  };

  const handleToggle = (targetColor: 'white'|'black') => {
    if (showMovesFor === targetColor) return;
    setShowMovesFor(targetColor);
    resetSelection();
  };

  const selectedDestInfo = (destinationSquare !== null ? moves.find(m => m.move.to === getSquareName(destinationSquare)) : null) || null;
  const stepText = getStepText(selectedDestInfo, exchangeStep);

  let liveText = '';
  if (stepText) {
    liveText = stepText;
  } else if (selectedDestInfo) {
    const primary = explain(selectedDestInfo).primary;
    const badgeText = BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].text;
    liveText = `Result for ${selectedDestInfo.move.to}: ${badgeText}. ${primary}`;
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>

      <div className="mode-bar" style={{ background: 'var(--panel)', color: 'var(--text-muted)', padding: '10px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
        <svg aria-hidden="true" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        ANALYSIS · Results are shown immediately
      </div>
      
      {!position ? (
        <div style={{ padding: '40px 24px', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
          <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Select a position</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SAMPLES.map((s, i) => (
                <li key={i}>
                  <button className="rv-hover" 
                    onClick={() => { resetSelection(); setFen(s.fen); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-text)', padding: 0, cursor: 'pointer', fontSize: '1rem', textDecoration: 'underline' }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <input aria-label="FEN" type="text" value={inputFen} onChange={handleFenChange} placeholder="Paste FEN here" 
                style={{ width: '100%', maxWidth: '400px', padding: '10px 12px', background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '1rem' }} 
              />
              {!validFen && <div style={{ color: 'var(--accent-text)', marginTop: '8px', fontSize: '0.9rem' }}>This position isn't valid. Check the FEN.</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="analysis-layout">
          {/* Top toolbar */}
          <div className="analysis-toolbar" style={{ background: 'var(--panel)', padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>FEN</span>
              <input aria-label="FEN" type="text" value={inputFen} onChange={handleFenChange} style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'IBM Plex Mono, monospace', minHeight: '44px' }} 
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Show moves for</span>
                <div style={{ display: 'flex', background: 'var(--bg-sunken)', borderRadius: '6px', padding: '4px' }}>
                  <button
                    aria-pressed={showMovesFor === 'white'}
                    onClick={() => handleToggle('white')}
                    disabled={!canSwitchTo('white')}
                    
                    style={{ minHeight: '44px', padding: '0 16px', background: showMovesFor === 'white' ? 'var(--panel)' : 'transparent', border: showMovesFor === 'white' ? '1px solid var(--border)' : '1px solid transparent', borderRadius: '4px', color: !canSwitchTo('white') ? 'var(--text-faint)' : 'var(--text)', fontWeight: 'bold', cursor: !canSwitchTo('white') ? 'not-allowed' : 'pointer' }}
                  >
                    White
                  </button>
                  <button
                    aria-pressed={showMovesFor === 'black'}
                    onClick={() => handleToggle('black')}
                    disabled={!canSwitchTo('black')}
                    
                    style={{ minHeight: '44px', padding: '0 16px', background: showMovesFor === 'black' ? 'var(--panel)' : 'transparent', border: showMovesFor === 'black' ? '1px solid var(--border)' : '1px solid transparent', borderRadius: '4px', color: !canSwitchTo('black') ? 'var(--text-faint)' : 'var(--text)', fontWeight: 'bold', cursor: !canSwitchTo('black') ? 'not-allowed' : 'pointer' }}
                  >
                    Black
                  </button>
                </div>
              </div>
              {(!canSwitchTo('white') || !canSwitchTo('black')) && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-faint)' }}>
                  {position && position.isCheck() ? `Not available — ${position.turn === 'white' ? 'White' : 'Black'} is in check.` : 'Not available for this position.'}
                </div>
              )}

            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="rv-hover" 
                onClick={() => setFlipped(!flipped)}
                style={{ background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
              >
                Flip Board
              </button>
              <button className="rv-hover" 
                onClick={() => { resetSelection(); setFen(''); setInputFen(''); }}
                style={{ background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
              >
                Change position
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
            
            <div className="board-container" style={{ flex: '1 1 400px', maxWidth: '640px', display: 'flex', flexDirection: 'column' }}>
            {position && showMovesFor !== position.turn && (
              <div style={{ background: 'var(--panel-hover)', color: 'var(--text)', padding: '12px', borderRadius: '6px', marginBottom: '16px', border: '1px solid var(--border)', fontSize: '0.95rem' }}>
                Showing {showMovesFor === 'white' ? "White's" : "Black's"} options as if it were {showMovesFor === 'white' ? "White's" : "Black's"} turn.
              </div>
            )}
              {expandedLevel >= 3 && exchangeStep > 0 && selectedDestInfo?.exchange && (
                <div style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-2)' }}>
                  Showing the exchange — step {exchangeStep} of {selectedDestInfo.exchange.bestLine.length}
                </div>
              )}
              <Board
                position={position}
                flipped={flipped}
                onSquareClick={onSquareClick}
                selectedSquare={selectedSquare}
                destinationSquare={destinationSquare}
                moves={moves}
                expandedLevel={expandedLevel}
                exchangeStep={exchangeStep}
                selectedDestInfo={selectedDestInfo}
                focusedSquare={focusedSquare}
                setFocusedSquare={setFocusedSquare}
              />
              
              <div style={{ padding: '16px 24px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  {!(selectedDestInfo && !(expandedLevel >= 3 && exchangeStep > 0)) && (
                    <div aria-hidden="true" style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>{liveText}</div>
                  )}
                  {showAnalyzingIndicator && <div aria-hidden="true" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}><span style={{display:"flex",alignItems:"center",gap:"8px"}}><Spinner /> Checking moves…</span></div>}
                </div>
                {selectedDestInfo && (
                  <ExchangeControls
                    expandedLevel={expandedLevel}
                    exchangeStep={exchangeStep}
                    setExchangeStep={setExchangeStep}
                    selectedDestInfo={selectedDestInfo}
                  />
                )}
              </div>
            </div>
            
            <ResultPanel
              selectedDestInfo={selectedDestInfo}
              expandedLevel={expandedLevel}
              setExpandedLevel={setExpandedLevel}
              exchangeStep={exchangeStep}
              setExchangeStep={setExchangeStep}
              stepText={stepText}
            />
          </div>
        </div>
      )}

      <style>{`
        .analysis-layout { display: flex; flex-direction: column; }
        @media (max-width: 767px) {
          .board-container { width: 100%; max-width: none !important; }
          .board-container > div[role="grid"] { border-left: none !important; border-right: none !important; outline: none !important; }
        }
        @media (min-width: 1024px) {
          .board-container { padding: 24px; border-right: 1px solid var(--border); }
        }
      `}</style>
    </div>
  );
};
