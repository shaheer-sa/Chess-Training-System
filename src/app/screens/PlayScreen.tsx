import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square, Role } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Board } from '../components/Board.js';
import { Piece } from '../components/Piece.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { LabelIcon } from '../components/LabelIcon.js';
import { Spinner } from '../components/Spinner.js';
import { GameState, newGame, legalDestinations, playMove, undo, outcome, previewSan, isPromotionMove, capturedPieces, materialBalance, castlingRookMove } from '../play/game.js';
import { PlaySettings, isBotTurn, undoPlies } from '../play/playSettings.js';
import { BotClient, StockfishBot } from '../bot/StockfishBot.js';
import type { BotLevel } from '../bot/levels.js';
import { LEVEL_ELO } from '../bot/levels.js';
import { pgnFromGame } from '../analysis/line.js';
import { EngineCheck, EngineCheckClient } from '../bot/EngineCheck.js';
import { EngineScores, TurnContext, turnContext, engineVerdict } from '../play/engineVerdict.js';
import { DisplayMove, toDisplay, displayText, hintSan } from '../play/display.js';
import { PlayedVerdict, PlayedVerdicts, VERDICTS_KEY, loadVerdicts, serializeVerdicts, pruneVerdicts, tacticInProgress, fromPlayed, decidePlayedVerdict } from '../play/playedVerdicts.js';
import { legalUciMoves } from '../play/game.js';


interface PlayScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
  onNavigate?: (screen: 'home' | 'help' | 'analysis', initialFen?: string, initialPgn?: string) => void;
  game: GameState;
  settings: PlaySettings;
  onChange: (g: GameState, settings: PlaySettings) => void;
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

const PROMO_ROLE: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

const formatSquare = (index: number) => {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index & 7));
  const rank = String.fromCharCode('1'.charCodeAt(0) + (index >> 3));
  return `${file}${rank}` as Square;
};

export const PlayScreen: React.FC<PlayScreenProps> = ({ engineClient, onNavigate, game, settings, onChange }) => {
  const hintsOn = settings.hintsOn;
  const [flipped, setFlipped] = useState(settings.mode === 'computer' && settings.humanColor === 'black');

  useEffect(() => {
    if (settings.mode === 'computer') {
      setFlipped(settings.humanColor === 'black');
    }
  }, [settings.mode, settings.humanColor]);

  // ---- Engine check (phase 5C): one Stockfish pass per hint turn verifies the square-safety labels ----
  const checkRef = useRef<EngineCheckClient | null>(null);
  const [check, setCheck] = useState<{ fen: string; scores: EngineScores; ctx: TurnContext | null } | null>(null);
  const [checkFailedFen, setCheckFailedFen] = useState<string | null>(null);
  // Engine-check verdicts of played moves, saved with the game (Last move card, move list, "Tactic in progress").
  const [playedVerdicts, setPlayedVerdicts] = useState<PlayedVerdicts>(() => {
    try { return loadVerdicts(localStorage.getItem(VERDICTS_KEY), game.moves.map(m => m.uci)); } catch { return {}; }
  });
  // The ledger the verdict queue reads: always the latest committed verdicts (state alone would be a stale closure).
  const verdictsRef = useRef<PlayedVerdicts>(playedVerdicts);
  const commitVerdicts = (next: PlayedVerdicts) => { verdictsRef.current = next; setPlayedVerdicts(next); };
  const commitVerdict = (i: number, p: PlayedVerdict | null) => {
    const next = { ...verdictsRef.current };
    if (p) next[i] = p; else delete next[i];
    commitVerdicts(next);
  };
  useEffect(() => {
    try { localStorage.setItem(VERDICTS_KEY, serializeVerdicts(game.moves.map(m => m.uci), playedVerdicts)); } catch { /* storage unavailable */ }
  }, [playedVerdicts, game.moves]);

  // Moves played before their turn's check finished get their verdict from this on-demand check.
  const lateCheckRef = useRef<EngineCheckClient | null>(null);
  // Every played move's verdict is decided in ONE queue, strictly in move order, so each decision sees the final
  // verdicts of all earlier moves. pendingVerdicts maps move index → the request token that owns its "Checking…".
  const verdictQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [pendingVerdicts, setPendingVerdicts] = useState<Record<number, number>>({});
  const clearPending = (i: number, token: number) =>
    setPendingVerdicts(prev => { if (prev[i] !== token) return prev; const next = { ...prev }; delete next[i]; return next; });
  useEffect(() => {
    return () => {
      checkRef.current?.dispose(); checkRef.current = null;
      lateCheckRef.current?.dispose(); lateCheckRef.current = null;
    };
  }, []);

  const botRef = useRef<BotClient | null>(null);
  const [computerThinking, setComputerThinking] = useState(false);
  const [computerError, setComputerError] = useState(false);
  const [botRetry, setBotRetry] = useState(0);

  useEffect(() => {
    return () => { botRef.current?.dispose(); botRef.current = null; };
  }, []);

  useEffect(() => {
    if (!isBotTurn(game, settings)) return;
    let active = true;
    const requestFen = game.currentFen;
    
    const runBot = async () => {
      setComputerThinking(true);
      setComputerError(false);
      if (!botRef.current) botRef.current = new StockfishBot();
      try {
        const [move] = await Promise.all([
          botRef.current.bestMove(game, settings.level),
          new Promise(r => setTimeout(r, 350))
        ]);
        if (active && game.currentFen === requestFen) {
          const fromIdx = parseSquare(move.slice(0, 2) as unknown as Square);
          const toIdx = parseSquare(move.slice(2, 4) as unknown as Square);
          if (fromIdx !== undefined && toIdx !== undefined) {
             executeMove(fromIdx, toIdx, move.endsWith('q') ? 'queen' : undefined, false);
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        if (active && game.currentFen === requestFen) {
          setComputerThinking(false);
          setComputerError(true);
        }
      } finally {
        if (active && game.currentFen === requestFen) setComputerThinking(false);
      }
    };
    runBot();
    return () => {
      active = false;
      botRef.current?.cancel();
      setComputerThinking(false);
    };
  }, [game, settings, botRetry]);
  
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [previewSquare, setPreviewSquare] = useState<number | null>(null);
  const [movesInfo, setMovesInfo] = useState<MoveClassification[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  
  
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string; dragged: boolean } | null>(null);
  // Slide animation for the last tap/keyboard move only (never for drag, undo, new game or a restored game).
  const [anim, setAnim] = useState<{ moves: { from: number; to: number }[]; key: number } | null>(null);

  
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
    if (legalDestinations(game, from).includes(to)) executeMove(from, to, undefined, true);
    // Illegal drop: the piece stays on its square and stays selected (selected at drag start).
  };

  const dragFromRef = useRef<number | null>(null);
  // The move list scrolls inside its own box and follows the newest move (the page itself never jumps).
  const moveListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moveListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game.moves.length]);
  const handlePieceDragStart = (from: number) => {
    dragFromRef.current = from;
    if (selectedSquare !== from) selectPiece(from);
  };

  const gameOutcome = outcome(game);
  const readOnly = !!gameOutcome;

  // A "hint turn": hints are on and the side to move gets hints (both sides in two-player, only the human vs computer).
  const hintsTurn = hintsOn && !gameOutcome && (settings.mode === 'two-player' || pos.turn === settings.humanColor);
  const checkReady = !!check && check.fen === game.currentFen;
  const checkFailed = checkFailedFen === game.currentFen;
  const ownVerdictPending = Object.keys(pendingVerdicts).some(k => game.moves[Number(k)]?.color === pos.turn);
  const checkPending = hintsTurn && ((!checkReady && !checkFailed) || ownVerdictPending);
  // Derived from history, so Undo and refresh keep it right: while my Tactic is in progress, no Tactic labels for me.
  const suppressTactic = tacticInProgress(game.moves.map(m => m.color), pruneVerdicts(playedVerdicts, game.moves.length), pos.turn);

  useEffect(() => {
    if (!hintsTurn) return;
    const fen = game.currentFen;
    if (check?.fen === fen) return;
    if (checkFailedFen === fen) setCheckFailedFen(null); // retry: wait again instead of showing square-only labels
    if (!checkRef.current) checkRef.current = new EngineCheck();
    const checker = checkRef.current;
    let active = true;
    checker.check(fen, legalUciMoves(game).length)
      .then(scores => { if (active) setCheck({ fen, scores, ctx: turnContext(fen, scores) }); })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (active) setCheckFailedFen(fen);
      });
    return () => { active = false; checker.cancel(); };
  }, [game.currentFen, hintsTurn]);

  const uciOf = (c: MoveClassification): string => c.move.from + c.move.to + (c.move.promotion ? 'q' : '');
  const toDisp = (c: MoveClassification): DisplayMove =>
    toDisplay(c, checkReady && check ? engineVerdict(c, check.scores[uciOf(c)], check.ctx) : { kind: 'none' }, suppressTactic);
  const mateIn = hintsTurn && checkReady && check?.ctx ? check.ctx.mateIn : null;

  const sideToMoveSquares: number[] = [];
  if (!readOnly && !promotionMove) {
    for (let i = 0; i < 64; i++) {
      const p = pos.board.get(i);
      if (p && p.color === pos.turn) sideToMoveSquares.push(i);
    }
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

  // After a reload, rebuild the square-check classification of every earlier move, so the move list and the Last
  // move card show the same labels as before (engine verdicts come back from storage).
  useEffect(() => {
    let replay = newGame(game.startFen);
    game.moves.forEach((m, i) => {
      const fenBefore = replay.currentFen;
      const promo = m.uci.length > 4 ? PROMO_ROLE[m.uci[4]] : undefined;
      const next = playMove(replay, parseSquare(m.uci.slice(0, 2))!, parseSquare(m.uci.slice(2, 4))!, promo);
      if (next) replay = next;
      if (moveTokens.current[i] !== undefined) return;
      if (promo && promo !== 'queen') return;
      if (settings.mode === 'computer' && m.color !== settings.humanColor) return;
      moveTokens.current[i] = -1;
      engineClient.classifyMove(fenBefore, { from: m.uci.slice(0, 2) as Square, to: m.uci.slice(2, 4) as Square, promotion: promo ? 'queen' : undefined }).then(res => {
        if (moveTokens.current[i] === -1 && res.ok) setMoveListInfo(prev => ({ ...prev, [i]: res.value }));
      }).catch(() => {});
    });
  }, [game, engineClient, settings.mode, settings.humanColor]);

  const resetSelection = () => {
    requestToken.current++;
    setSelectedSquare(null);
    setPreviewSquare(null);
    setMovesInfo([]);
    setAnalyzing(false);
  };

  const selectPiece = (index: number) => {
    // Invalidate the previous piece's request and clear its badges before asking for the new piece.
    const token = ++requestToken.current;
    setSelectedSquare(index);
    setPreviewSquare(null);
    setMovesInfo([]);
    setAnalyzing(hintsOn);
    if (hintsOn) {
      const sqName = formatSquare(index);
      engineClient.classifyMovesFrom(game.currentFen, sqName).then(result => {
        if (token === requestToken.current && result) {
          setMovesInfo(result.ok ? result.value : []);
          setAnalyzing(false);
        }
      }).catch(() => {
        if (token === requestToken.current) setAnalyzing(false);
      });
    }
  };

  const handleDragOverSquare = (index: number | null) => {
    const from = dragFromRef.current;
    if (index === null) dragFromRef.current = null;
    setPreviewSquare(hintsOn && index !== null && from !== null && legalDestinations(game, from).includes(index) ? index : null);
  };

  const handleSquareClick = (index: number) => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (readOnly) return;
    if (computerThinking || isBotTurn(game, settings)) return; // the human never moves for the computer
    
    if (promotionMove) return; // Wait for dialog
    
    if (selectedSquare === null) {
      const piece = pos.board.get(index);
      if (piece && piece.color === pos.turn) {
        selectPiece(index);
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
          selectPiece(index); // select new piece
        }
        return;
      }

      executeMove(selectedSquare, index);
    }
  };

  const executeMove = (fromIdx: number, toIdx: number, promoRole?: Role, dragged = false) => {
    botRef.current?.cancel();
    const fromStr = formatSquare(fromIdx);
    const toStr = formatSquare(toIdx);
    
    // Check if promotion is needed
    const promotes = isPromotionMove(game, fromIdx, toIdx);
    if (!promoRole && promotes) {
      setPromotionMove({ from: fromStr, to: toStr, dragged });
      return;
    }
    
    const newGameSt = playMove(game, fromIdx, toIdx, promoRole);
    if (newGameSt) {
      const moveIndex = newGameSt.moves.length - 1;
      const fenBefore = game.currentFen;
      
      // The engine check of THIS position decides the played move's verdict (independent of what the hints showed).
      const checkAtPlay = hintsTurn && checkReady && check ? check : null;
      const wantsVerdict = hintsTurn;
      const legalCountBefore = wantsVerdict && !checkAtPlay ? legalUciMoves(game).length : 0;
      const playedUci = fromStr + toStr + (promotes ? 'q' : '');
      const moveColors = newGameSt.moves.map(m => m.color);
      commitVerdict(moveIndex, null);

      const rook = castlingRookMove(fromIdx, toIdx);
      setAnim(dragged ? null : { moves: rook ? [{ from: fromIdx, to: toIdx }, rook] : [{ from: fromIdx, to: toIdx }], key: newGameSt.moves.length });
      onChange(newGameSt, settings);
      resetSelection();
      setPromotionMove(null);
      
      // The engine analyses queen promotion only: no label for under-promotions.
      if (promotes && promoRole !== 'queen') return;
      // Hints are for the human only: the computer's moves are never classified.
      if (settings.mode === 'computer' && pos.turn !== settings.humanColor) return;
      const token = ++requestToken.current;
      moveTokens.current[moveIndex] = token;
      const basePromise = engineClient.classifyMove(fenBefore, { from: fromStr, to: toStr, promotion: promotes ? 'queen' : undefined });
      if (!wantsVerdict) {
        basePromise.then(res => {
          if (moveTokens.current[moveIndex] === token && res.ok) setMoveListInfo(prev => ({ ...prev, [moveIndex]: res.value }));
        }).catch(() => {});
        return;
      }
      setPendingVerdicts(prev => ({ ...prev, [moveIndex]: token }));
      verdictQueueRef.current = verdictQueueRef.current.then(async () => {
        try {
          const res = await basePromise;
          if (moveTokens.current[moveIndex] !== token || !res.ok) return; // undone, or not classifiable
          const base = res.value;
          let scores = checkAtPlay?.scores;
          let ctx = checkAtPlay?.ctx ?? null;
          if (!checkAtPlay) {
            // Played before this turn's check finished: check the position it was played in.
            if (!lateCheckRef.current) lateCheckRef.current = new EngineCheck();
            try {
              scores = await lateCheckRef.current.check(fenBefore, legalCountBefore);
              ctx = turnContext(fenBefore, scores);
            } catch {
              scores = undefined; // check unavailable: the move keeps its square-check label
            }
            if (moveTokens.current[moveIndex] !== token) return;
          }
          const decided = scores
            ? decidePlayedVerdict(engineVerdict(base, scores[playedUci], ctx), moveColors, verdictsRef.current, moveIndex)
            : null;
          commitVerdict(moveIndex, decided);
          setMoveListInfo(prev => ({ ...prev, [moveIndex]: base }));
        } catch {
          // classification failed: no label for this move
        } finally {
          clearPending(moveIndex, token);
        }
      });
    }
  };

  const handleUndo = () => {
    botRef.current?.cancel();
    setComputerError(false);
    let nextGame = game;
    for (let k = undoPlies(game, settings); k > 0; k--) nextGame = undo(nextGame);
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
    setAnim(null);
    commitVerdicts(pruneVerdicts(verdictsRef.current, keep));
    setPendingVerdicts(prev => { const next: Record<number, number> = {}; for (const [k, t] of Object.entries(prev)) if (Number(k) < keep) next[Number(k)] = t; return next; });
    onChange(nextGame, settings);
    resetSelection();
  };

  // Every way of starting a game (New game, mode, "You play") resets ALL per-game state here.
  const startNewGame = (nextSettings: PlaySettings): boolean => {
    if (game.moves.length > 0 && !gameOutcome) {
      if (!window.confirm("Start a new game? The current game will be lost.")) return false;
    }
    botRef.current?.cancel();
    setComputerThinking(false);
    setComputerError(false);
    setAnim(null);
    setMoveListInfo({});
    moveTokens.current = {};
    commitVerdicts({});
    setPendingVerdicts({});
    setPromotionMove(null);
    resetSelection();
    setFlipped(nextSettings.mode === 'computer' && nextSettings.humanColor === 'black');
    onChange(newGame(), nextSettings);
    return true;
  };

  const handleNewGame = () => { startNewGame(settings); };
  const analyzeGame = () => {
    const players = settings.mode === 'computer'
      ? (settings.humanColor === 'white' ? { white: 'You', black: `Computer (level ${settings.level})` } : { white: `Computer (level ${settings.level})`, black: 'You' })
      : { white: 'White', black: 'Black' };
    onNavigate?.('analysis', undefined, pgnFromGame(game, players));
  };


  const caps = capturedPieces(game);
  const matBal = materialBalance(game);
  
  /** The computer's strip glows while it thinks, so the waiting state is visible where the player looks. */
  const thinkingStrip = (color: 'white' | 'black') =>
    settings.mode === 'computer' && color !== settings.humanColor && computerThinking ? 'rv-thinking' : undefined;

  const renderStripLabel = (color: 'white' | 'black') => {
    const isComputer = settings.mode === 'computer' && color !== settings.humanColor;
    const name = settings.mode === 'two-player' ? (color === 'white' ? 'White' : 'Black') : isComputer ? `Computer · Level ${settings.level}` : 'You';
    return (
      <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {name}
        {isComputer && computerThinking && (
          <span role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-2)', fontWeight: 'normal' }}><Spinner /> Thinking<span className="rv-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
        )}
      </span>
    );
  };

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

    return (
      <div className="rv-tray" aria-label={ariaLabel || 'Captured: none'}>
        {pieces.length === 0 && !isAhead ? (
          <span>No captures yet</span>
        ) : (
          <>
            {pieces.map((p, i) => (
              <div key={i} aria-hidden="true">
                {(() => { const tc = color === 'white' ? 'b' : 'w'; const tt = p === 'knight' ? 'N' : p[0].toUpperCase(); return <Piece color={tc as 'w'|'b'} type={tt as 'P'|'N'|'B'|'R'|'Q'|'K'} />; })()}
              </div>
            ))}
            {isAhead && <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>+{amtAhead}</span>}
          </>
        )}
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

  const labelChip = (c: { label: DisplayMove['label'] }) => {
    const b = BADGE_INFO[c.label as keyof typeof BADGE_INFO];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '4px', background: b.color, color: b.textColor, fontSize: '0.8rem', fontWeight: 600 }}>
        <LabelIcon kind={c.label as keyof typeof BADGE_INFO} size={14} />
        {b.text}
      </span>
    );
  };

  const moveDetails = (d: DisplayMove, inHints = true) => {
    const t = displayText(d, { hideMate: inHints && mateIn !== null });
    return (
      <>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>{t.primary}</div>
        {t.squareCheck && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.squareCheck}</div>}
        {t.notes.map((n, i) => <div key={i} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{n}</div>)}
      </>
    );
  };

  const infoFor = (destIdx: number): DisplayMove | undefined => {
    const c = movesInfo.find(m => m.move.to === formatSquare(destIdx));
    return c ? toDisp(c) : undefined;
  };

  const renderLastMoveCard = () => {
    const i = game.moves.length - 1;
    if (i < 0) return null;
    const base = moveListInfo[i];
    const pending = pendingVerdicts[i] !== undefined;
    const info: DisplayMove | undefined = base && !pending ? toDisplay(base, fromPlayed(playedVerdicts[i]), false) : undefined;
    return (
      <div key={`last-${i}`} className="rv-rise" style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--panel)', borderRadius: '8px', border: '2px solid var(--accent)', padding: '16px' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Last move</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontWeight: 'bold' }}>{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'} {game.moves[i].san}</span>
          {hintsOn && info && (!game.moves[i] || settings.mode !== 'computer' || game.moves[i].color === settings.humanColor) && labelChip(info)}
          {hintsOn && pending && <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}><Spinner /> Checking…</span>}
        </div>
        {hintsOn && info && moveDetails(info, false)}
      </div>
    );
  };

  // Engine-check status lines (shown with the hints, so the player knows where labels come from).
  const renderCheckNotices = () => {
    if (!hintsTurn) return null;
    return (
      <>
        {checkFailed && (
          <p role="status" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Engine check unavailable — showing square-safety labels only.</p>
        )}
        {suppressTactic && (
          <p role="status" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)' }}>Tactic in progress — find the follow-up yourself. Tactic labels return after it.</p>
        )}
      </>
    );
  };

  const renderHintPanel = () => {
    if (selectedSquare === null) {
      if (game.moves.length > 0) {
        return (
          <>
            {renderLastMoveCard()}
            {renderCheckNotices()}
          </>
        );
      }
      if (!hintsOn) return null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Tap one of your pieces to see where it can go.</p>
          {renderCheckNotices()}
        </div>
      );
    }
    if (!hintsOn) return null;
    
    const sqName = formatSquare(selectedSquare);
    const piece = pos.board.get(selectedSquare);
    const pieceName = piece ? getPieceName(piece.color === 'white' ? 'w' : 'b', piece.role === 'pawn' ? 'P' : piece.role === 'knight' ? 'N' : piece.role === 'bishop' ? 'B' : piece.role === 'rook' ? 'R' : piece.role === 'queen' ? 'Q' : 'K') : '';
    
    const dests = legalDestinations(game, selectedSquare);
    dests.sort((a, b) => a - b);
    
    if (analyzing || checkPending) {
       return (
         <div role="status" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)' }}>
           <span style={{display:"flex",alignItems:"center",gap:"8px"}}><Spinner /> Checking moves…</span>
           <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
               {[0, 1, 2, 3].map(k => <div key={k} className="rv-skeleton" style={{ height: 36, width: 64 }} />)}
             </div>
             <div className="rv-skeleton" style={{ height: 96 }} />
           </div>
         </div>
       );
    }
    
    const previewIdx = previewSquare !== null && dests.includes(previewSquare) ? previewSquare : null;
    const previewInfo = previewIdx !== null ? infoFor(previewIdx) : undefined;
    const sanFor = (d: number) => hintSan(previewSan(game, selectedSquare, d) ?? formatSquare(d), mateIn !== null);
    return (
      <div key={`sel-${selectedSquare}`} className="rv-fade-in-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{pieceName} on {sqName} — where it can go</h3>
        {renderCheckNotices()}
        {dests.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>This piece has no legal moves.</p>
        ) : (
          <div role="group" aria-label="Legal moves" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {dests.map((destIdx, n) => {
              const mInfo = infoFor(destIdx);
              const b = mInfo ? BADGE_INFO[mInfo.label as keyof typeof BADGE_INFO] : null;
              return (
                <button
                  key={destIdx}
                  type="button"
                  className="rv-dest rv-pop"
                  aria-pressed={previewIdx === destIdx}
                  aria-label={`${sanFor(destIdx)}${b ? `, ${b.text}` : ''}`}
                  onMouseEnter={() => setPreviewSquare(destIdx)}
                  onFocus={() => setPreviewSquare(destIdx)}
                  onClick={() => setPreviewSquare(destIdx)}
                  style={{ ['--i' as string]: n }}
                >
                  <span className="mono">{sanFor(destIdx)}</span>
                  {b && mInfo && (
                    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: b.color, color: b.textColor }}>
                      <LabelIcon kind={mInfo.label} size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {dests.length > 0 && (
          <div aria-live="polite" className={previewIdx !== null ? 'rv-detail rv-detail--on' : 'rv-detail'}>
            {previewIdx !== null ? (
              <div key={previewIdx} className="rv-fade-in-panel" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontWeight: 'bold' }}>{sanFor(previewIdx)}</span>
                  {previewInfo && labelChip(previewInfo)}
                </div>
                {previewInfo && moveDetails(previewInfo)}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Hover a square on the board, or a move above, to see what happens. On a phone, tap a move above or long-press a square.
              </p>
            )}
          </div>
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
        {settings.mode === 'two-player' ? `PLAY · Two players · Hints ${hintsOn ? 'on' : 'off'}` : `PLAY · vs Computer · Level ${settings.level} · You are ${settings.humanColor === 'white' ? 'White' : 'Black'} · Hints ${hintsOn ? 'on' : 'off'}`}
      </div>

      <div className="play-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
        
        {/* Top Controls */}
        <div className="play-controls" style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexWrap: 'wrap', gap: '12px 16px', marginBottom: '16px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            <div className="rv-seg" style={{ alignSelf: 'flex-start' }}>
              <button aria-pressed={settings.mode === 'two-player'} onClick={() => { if (settings.mode !== 'two-player') { startNewGame({ ...settings, mode: 'two-player' }); } }}>Two players</button>
              <button aria-pressed={settings.mode === 'computer'} onClick={() => { if (settings.mode !== 'computer') { startNewGame({ ...settings, mode: 'computer' }); } }}>vs Computer</button>
            </div>
            
            {settings.mode === 'computer' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>You play:</span>
                  <div className="rv-seg">
                    <button aria-pressed={settings.humanColor === 'white'} onClick={() => { if (settings.humanColor !== 'white') { startNewGame({ ...settings, humanColor: 'white' }); } }}>White</button>
                    <button aria-pressed={settings.humanColor === 'black'} onClick={() => { if (settings.humanColor !== 'black') { startNewGame({ ...settings, humanColor: 'black' }); } }}>Black</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '12px' }}>Level:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="rv-seg rv-seg--levels">
                      {([1, 2, 3, 4, 5, 6] as BotLevel[]).map(lvl => (
                        <button key={lvl} aria-label={`Level ${lvl}, about ${LEVEL_ELO[lvl]} rating (estimate)`} aria-pressed={settings.level === lvl} onClick={() => onChange(game, { ...settings, level: lvl })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', gap: '2px', lineHeight: 1.1 }}>
                          <span style={{ fontWeight: 'bold' }}>{lvl}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>≈{LEVEL_ELO[lvl]}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ratings are estimates.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
              <input type="checkbox" checked={hintsOn} onChange={(e) => { onChange(game, { ...settings, hintsOn: e.target.checked }); resetSelection(); }} />
              Show hints
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
              <input type="checkbox" checked={settings.trainingMode} aria-describedby="rv-training-help" onChange={(e) => onChange(game, { ...settings, trainingMode: e.target.checked })} />
              Training mode
            </label>
            <button className="rv-btn" onClick={handleUndo} disabled={undoPlies(game, settings) === 0}>Undo</button>
            <button className="rv-btn" onClick={() => setFlipped(!flipped)}>Flip board</button>
            <button className="rv-btn" onClick={handleNewGame}>New game</button>
            {(settings.trainingMode || gameOutcome) && (
              <button className="rv-btn" onClick={() => onNavigate?.('analysis', game.currentFen)}>Analyze this position</button>
            )}
          </div>
          <p id="rv-training-help" style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {settings.trainingMode
              ? 'Training mode on: you can open the position in Analyze during the game.'
              : 'Training mode off: Analyze opens when the game is over. Hints follow their own setting.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', width: '100%', maxWidth: '1000px' }}>
          
          <div className="play-board-col" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
            {/* Player strip (opponent) */}
            <div className={thinkingStrip(flipped ? 'white' : 'black')} style={{ background: 'var(--panel)', padding: '10px 14px', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', border: '1px solid var(--border)', borderBottom: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {renderStripLabel(flipped ? 'white' : 'black')}
                {pos.turn === (flipped ? 'white' : 'black') && <span style={{ color: 'var(--accent-text)', fontWeight: 'bold' }}>to move</span>}
              </div>
              {renderCaptured(flipped ? 'white' : 'black')}
            </div>
            
            <div style={{ width: '100%', position: 'relative' }}>
              {(checkPending || analyzing || computerThinking) && <div className="rv-progress" aria-hidden="true" />}
              <Board 
                position={pos}
                flipped={flipped}
                selectedSquare={selectedSquare}
                destinationSquare={previewSquare}
                moves={hintsOn && movesInfo.length > 0 && !checkPending ? movesInfo.map(toDisp) : []}
                expandedLevel={1}
                exchangeStep={0}
                selectedDestInfo={null}
                onSquareClick={handleSquareClick}
                readOnly={readOnly}
                lastMove={lastMoveObj}
                checkSquare={checkSquare}
                legalDestinations={selectedSquare !== null ? legalDestinations(game, selectedSquare) : undefined}
                onSquarePointerDown={handlePointerDown}
                onSquarePointerUp={clearLongPress}
                onSquarePointerCancel={clearLongPress}
                onSquareMouseEnter={handleMouseEnter}
                onSquareMouseLeave={handleMouseLeave}
                draggableSquares={computerThinking || isBotTurn(game, settings) ? [] : sideToMoveSquares}
                onPieceDrop={handlePieceDrop}
                onPieceDragStart={handlePieceDragStart}
                onDragOverSquare={handleDragOverSquare}
                animateMoves={anim?.moves}
                animationKey={anim?.key}
              />
              
              {promotionMove && (
                <div role="dialog" aria-modal="true" ref={promoDialogRef} tabIndex={-1} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ fontWeight: 'bold', textAlign: 'center' }}>Choose promotion</div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map(role => (
                      <button className="rv-hover" key={role} aria-label={PROMO_NAME[role]} onClick={() => executeMove(parseSquare(promotionMove.from)!, parseSquare(promotionMove.to)!, role, promotionMove.dragged)} style={{ width: '60px', height: '60px', padding: '6px', background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                        <Piece color={pos.turn === 'white' ? 'w' : 'b'} type={PROMO_TYPE[role]} style={{ width: '100%', height: '100%' }} />
                      </button>
                    ))}
                    </div>
                    <button className="rv-btn" onClick={() => setPromotionMove(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Player strip (self) */}
            <div className={thinkingStrip(flipped ? 'black' : 'white')} style={{ background: 'var(--panel)', padding: '10px 14px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', border: '1px solid var(--border)', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {renderStripLabel(flipped ? 'black' : 'white')}
                {pos.turn === (flipped ? 'black' : 'white') && <span style={{ color: 'var(--accent-text)', fontWeight: 'bold' }}>to move</span>}
              </div>
              {renderCaptured(flipped ? 'black' : 'white')}
            </div>
            
            {/* Status Line */}
            <div aria-live="polite" style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-sunken)', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold' }}>
              {currentStatusText}
            </div>
          </div>
          
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            {mateIn !== null && (
              <div role="status" className="rv-rise" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--panel)', border: '2px solid var(--accent)', borderRadius: '8px', color: 'var(--text)', fontWeight: 600 }}>
                <LabelIcon kind="tactic" size={18} />
                <span>
                  Engine check: {settings.mode === 'computer' ? 'you have' : `${pos.turn === 'white' ? 'White' : 'Black'} has`} a checkmate in {mateIn}. Can you find it?
                </span>
              </div>
            )}
            {gameOutcome && (
              <div className="rv-rise" style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--accent)', textAlign: 'center' }}>
                <h2>Game Over</h2>
                <p style={{ fontSize: '1.2rem', marginBottom: '16px' }}>{statusText}</p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="rv-btn rv-btn--primary" onClick={analyzeGame}>Analyze this game</button>
                  <button className="rv-btn" onClick={handleNewGame}>New game</button>
                </div>
              </div>
            )}
            
            {computerError && (
              <div style={{ background: 'var(--panel)', padding: '16px', borderRadius: '8px', border: '1px solid var(--danger)', textAlign: 'center' }}>
                <p style={{ margin: '0 0 16px 0', color: 'var(--danger-text)', fontWeight: 'bold' }}>The computer couldn't move.</p>
                <button className="rv-btn" onClick={() => { setComputerError(false); setBotRetry(r => r + 1); }}>Try again</button>
              </div>
            )}
            {renderHintPanel()}
            
            <div style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>Moves</h3>
              {game.moves.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>No moves yet.</p>}
              <div ref={moveListRef} className="rv-movelist" tabIndex={game.moves.length > 0 ? 0 : -1} aria-label="Moves played">
                {game.moves.map((move, i) => {
                  const listBase = moveListInfo[i];
                  const mInfo = listBase ? toDisplay(listBase, fromPlayed(playedVerdicts[i]), false) : undefined;
                  const badge = mInfo ? BADGE_INFO[mInfo.label] : null;
                  return (
                    <div key={i} className={i === game.moves.length - 1 ? 'rv-chip-new' : undefined} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-sunken)', padding: '4px 8px', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{i % 2 === 0 ? `${i / 2 + 1}.` : ''}</span>
                      <span className="mono" style={{ fontWeight: 'bold' }}>{move.san}</span>
                      {mInfo && badge && (
                        // Icon + colour + accessible name: never colour alone (HCI §29).
                        <span role="img" aria-label={badge.text} title={badge.text} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: badge.color, color: badge.textColor }}>
                          <LabelIcon kind={mInfo.label} size={11} />
                        </span>
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
