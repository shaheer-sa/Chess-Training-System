import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { makeFen } from 'chessops/fen';

interface AnalysisScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
  onNavigate?: (screen: any) => void;
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
  safe: { icon: '✓', text: 'Safe', meaning: 'No immediate material or tactical problem was found. It does not mean this is the best move.', color: '#2e7d32' },
  even_trade: { icon: '⇄', text: 'Even trade', meaning: 'Your piece can be taken, but you win back the same value.', color: '#1565c0' },
  loses_material: { icon: '⚠', text: 'Loses material', meaning: 'This move loses material or allows a tactic against you right away.', color: '#c62828' },
  unclear: { icon: '?', text: 'Unclear', meaning: 'This needs deeper calculation than this trainer does — check it yourself.', color: '#f57f17' },
} as const;

const PIECES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king'
};

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
  
  const analyzingTimer = useRef<any>(null);

  useEffect(() => {
    if (fen) {
      const setup = fenOps.parseFen(fen);
      if (setup.isOk) {
        const posRes = Chess.fromSetup(setup.unwrap());
        if (posRes.isOk) {
          setPosition(posRes.unwrap());
          setValidFen(true);
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
      // Select own piece
      setSelectedSquare(index);
      setEngineError(false);
      setDestinationSquare(null);
      setMoves([]);
      setAnalyzing(true);
      setShowAnalyzingIndicator(false);

      if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
      analyzingTimer.current = setTimeout(() => {
        setShowAnalyzingIndicator(true);
      }, 150);

      const algSquare = getSquareName(index) as Square;
      try {
        const res = await engineClient.classifyMovesFrom(fen, algSquare);
        if (res.ok) {
          setMoves(res.value);
        } else {
          if (res.error && res.error.code === 'ILLEGAL_MOVE') {
            setMoves([]);
          } else {
            setEngineError(true);
          }
        }
      } catch (e) {
        setEngineError(true);
      } finally {
        setAnalyzing(false);
        setShowAnalyzingIndicator(false);
        if (analyzingTimer.current) clearTimeout(analyzingTimer.current);
      }
    } else if (selectedSquare !== null) {
      // Selected a destination?
      const targetAlg = getSquareName(index);
      const isLegal = moves.find(m => m.move.to === targetAlg);
      if (isLegal) {
        setDestinationSquare(index);
      } else {
        setResultMessage("That square isn't a legal move for this piece.");
        setTimeout(() => setResultMessage(''), 3000);
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
      if (e.key === 'ArrowUp') nextRank = Math.min(7, currentRank + 1);
      if (e.key === 'ArrowDown') nextRank = Math.max(0, currentRank - 1);
      if (e.key === 'ArrowLeft') nextFile = Math.max(0, currentFile - 1);
      if (e.key === 'ArrowRight') nextFile = Math.min(7, currentFile + 1);
      const nextIndex = (nextRank << 3) | nextFile;
      const el = document.getElementById(`sq-${nextIndex}`);
      if (el) el.focus();
    }
  };

  const renderSquare = (rank: number, file: number) => {
    const index = (rank << 3) | file;
    const isLight = (rank + file) % 2 !== 0;
    const sqName = getSquareName(index);
    const piece = position?.board.get(index);
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

    return (
      <div
        id={`sq-${index}`}
        key={index}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onKeyDown={(e) => handleKeyDown(e, index)}
        onClick={() => onSquareClick(index)}
        style={{
          width: '12.5%',
          height: '12.5%',
          backgroundColor: isLight ? '#f0d9b5' : '#b58863',
          position: 'absolute',
          left: `${file * 12.5}%`,
          top: `${(7 - rank) * 12.5}%`,
          boxSizing: 'border-box',
          border: isSelected ? '3px solid #333' : isSelectedDest ? '3px solid #fff' : 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        {piece && (
          <svg viewBox="0 0 45 45" width="80%" height="80%">
            <text x="22.5" y="35" fontSize="35" textAnchor="middle" fill={piece.color === 'white' ? '#fff' : '#000'} stroke={piece.color === 'white' ? '#000' : '#fff'} strokeWidth="1.5">
              {piece.role === 'pawn' ? '♟' : piece.role === 'knight' ? '♞' : piece.role === 'bishop' ? '♝' : piece.role === 'rook' ? '♜' : piece.role === 'queen' ? '♛' : '♚'}
            </text>
          </svg>
        )}
        {isDestination && !piece && (
          <div style={{ width: '20%', height: '20%', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.3)' }} />
        )}
        {isDestination && piece && (
          <div style={{ position: 'absolute', width: '100%', height: '100%', border: '4px solid rgba(0,0,0,0.3)', borderRadius: '50%', boxSizing: 'border-box' }} />
        )}
        {isDestination && moveInfo && (
          <div style={{
            position: 'absolute', top: 2, right: 2, backgroundColor: BADGE_INFO[moveInfo.label].color,
            color: '#fff', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'
          }}>
            {BADGE_INFO[moveInfo.label].icon}
          </div>
        )}
      </div>
    );
  };

  const squares = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      squares.push(renderSquare(rank, file));
    }
  }

  const selectedDestInfo = destinationSquare !== null ? moves.find(m => m.move.to === getSquareName(destinationSquare)) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
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
              <li key={i}><button onClick={() => setFen(s.fen)}>{s.name}</button></li>
            ))}
          </ul>
          <div>
            <input type="text" value={inputFen} onChange={handleFenChange} placeholder="Paste FEN here" style={{ width: '300px' }} />
            {!validFen && <div style={{ color: 'red' }}>This position isn't valid. Check the FEN.</div>}
          </div>
        </div>
      )}

      {position && (
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, padding: '10px' }}>
          <div style={{ flex: '1 1 400px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', border: '1px solid #ccc' }}>
              {squares}
            </div>
            
            <div style={{ marginTop: '10px', minHeight: '30px' }}>
              {resultMessage && <div>{resultMessage}</div>}
              {selectedSquare === null && !resultMessage && <div>Tap one of your pieces to check where it can go.</div>}
              {selectedSquare !== null && moves.length === 0 && !analyzing && !engineError && <div>This piece has no legal moves.</div>}
              {selectedSquare !== null && moves.length > 0 && destinationSquare === null && <div>Tap a square to see why.</div>}
              {showAnalyzingIndicator && <div>Checking moves…</div>}
              {engineError && <div>We couldn't analyze this move. Try another square.</div>}
            </div>
          </div>
          
          <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', marginLeft: '10px' }}>
            {selectedDestInfo ? (
              <div aria-live="polite">
                <h2>{BADGE_INFO[selectedDestInfo.label].text}</h2>
                <span style={{ fontSize: '24px' }}>{BADGE_INFO[selectedDestInfo.label].icon}</span>
                <p>Result: {BADGE_INFO[selectedDestInfo.label].text}. {BADGE_INFO[selectedDestInfo.label].meaning}</p>
                <p>You lose more material than you win.</p>
              </div>
            ) : (
              <div>Result panel</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
