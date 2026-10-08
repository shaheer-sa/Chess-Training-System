import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { explain } from '../explain/explain.js';
import { Board } from '../components/Board.js';
import { ResultPanel } from '../components/ResultPanel.js';

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

export function formatPawns(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  const plural = Math.abs(pawns) === 1 ? 'pawn' : 'pawns';
  return `${sign}${pawns} ${plural}`;
}

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
            {expandedLevel >= 3 && exchangeStep > 0 && selectedDestInfo?.exchange && (
              <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 'bold' }}>
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
            
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minHeight: '30px' }}>
                <div aria-hidden="true">{liveText}</div>
                {showAnalyzingIndicator && <div aria-hidden="true">Checking moves…</div>}
              </div>
              {expandedLevel >= 3 && selectedDestInfo?.exchange && selectedDestInfo.exchange.bestLine.length > 0 && (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={() => setExchangeStep(0)} disabled={exchangeStep === 0}>Back to position</button>
                  <button onClick={() => setExchangeStep(Math.max(1, exchangeStep - 1))} disabled={exchangeStep <= 1}>Prev</button>
                  <button onClick={() => setExchangeStep(Math.min(selectedDestInfo.exchange!.bestLine.length, exchangeStep + 1))} disabled={exchangeStep === selectedDestInfo.exchange!.bestLine.length}>Next</button>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setFlipped(!flipped)}>Flip Board</button>
              <button onClick={() => { resetSelection(); setFen(''); setInputFen(''); }}>Change position</button>
              {onNavigate && <button onClick={() => onNavigate('help')} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>What do the labels mean?</button>}
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
      )}
    </div>
  );
};
