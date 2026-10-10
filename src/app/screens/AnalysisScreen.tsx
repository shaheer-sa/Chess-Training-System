import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { MoveClassification, Square } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { Board, BoardArrow, MoveBadge } from '../components/Board.js';
import { RATING_INFO } from '../shared/ratingInfo.js';
import { ResultPanel } from '../components/ResultPanel.js';
import { getStepText } from '../shared/exchange.js';
import { ExchangeControls } from '../shared/ExchangeControls.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { explain } from '../explain/explain.js';

import { Spinner } from '../components/Spinner.js';
import type { ScreenName } from '../App.js';
import { RvSelect, RvOption } from '../components/RvSelect.js';
import { LineState, newLine, pathOf, stateAt, playOnLine, goTo, backToGame, isExploring, lineFromPgn, fensOf } from '../analysis/line.js';
import { legalDestinations, castlingRookMove } from '../play/game.js';
import { Searcher, useLineReview } from '../analysis/useLineReview.js';
import { evalLabel, sanOfUci, summarize, whiteScore, winPercent, MoveReview } from '../analysis/review.js';
import { EvalBar, EvalGraph, MoveCard, SummaryCard, RatingChip } from '../components/ReviewViews.js';
import { readSettings, saveSettings, applySettings, SETTINGS_EVENT } from '../settings.js';

/** Where the analysis comes from. PGN is the default; PGN and My games arrive in later phases. */
export type AnalyzeSource = 'pgn' | 'fen' | 'games';
const SOURCES: RvOption<AnalyzeSource>[] = [
  { value: 'pgn', title: 'PGN — a whole game', hint: 'Paste a game and step through it move by move.' },
  { value: 'fen', title: 'FEN — one position', hint: 'Paste a position and play it out from there.' },
  { value: 'games', title: 'My games', hint: 'Games you play here, once accounts are ready.', badge: 'Coming soon' },
];

interface AnalysisScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
  /** A game to open straight away (from Play: "Analyze this game"). */
  initialPgn?: string;
  onNavigate?: (screen: ScreenName) => void;
  /** Engine used for the game review (tests pass a fake). */
  createReviewSearcher?: () => Searcher;
}

export const AnalysisScreen: React.FC<AnalysisScreenProps> = ({ engineClient, initialFen, initialPgn, onNavigate, createReviewSearcher }) => {
  const [source, setSource] = useState<AnalyzeSource>(initialPgn ? 'pgn' : initialFen ? 'fen' : 'pgn');
  const initSetup = initialFen && !initialPgn ? fenOps.parseFen(initialFen) : null;
  const initPosRes = initSetup?.isOk ? Chess.fromSetup(initSetup.unwrap()) : null;
  const initPos = initPosRes?.isOk ? initPosRes.unwrap() : null;

  // The board can be played from any position, for both sides. FEN: a line from that position.
  // PGN: the game's moves, plus the player's own line when they try something else.
  const [fenLine, setFenLine] = useState<LineState | null>(() => (initPos && initialFen ? newLine(initialFen) : null));
  const [pgnText, setPgnText] = useState(initialPgn ?? '');
  const [pgnError, setPgnError] = useState('');
  const [pgnLine, setPgnLine] = useState<LineState | null>(() => {
    if (!initialPgn) return null;
    const r = lineFromPgn(initialPgn);
    return r.ok ? goTo(r.line, r.line.game.length) : null;
  });
  const line = source === 'pgn' ? pgnLine : source === 'fen' ? fenLine : null;
  // Moving one step forward (playing a move, Next) slides the piece, as in Play.
  const [anim, setAnim] = useState<{ moves: { from: number; to: number }[]; key: number } | null>(null);
  const animKey = useRef(0);
  const setLine = (l: LineState, opts: { animate?: boolean } = {}) => {
    const step = line && l.cursor === line.cursor + 1 && opts.animate !== false ? pathOf(l)[l.cursor - 1] : null;
    if (step) {
      const sqi = (x: string) => (x.charCodeAt(1) - 49) * 8 + (x.charCodeAt(0) - 97);
      const from = sqi(step.uci.slice(0, 2)), to = sqi(step.uci.slice(2, 4));
      const rook = step.role === 'king' ? castlingRookMove(from, to) : null;
      setAnim({ moves: rook ? [{ from, to }, rook] : [{ from, to }], key: ++animKey.current });
    } else {
      setAnim(null);
    }
    if (source === 'pgn') setPgnLine(l); else setFenLine(l);
  };
  const [showBest, setShowBest] = useState(false);
  /** The move whose better alternative is shown on the position before it (id = cursor + move). */
  const [betterFor, setBetterFor] = useState<string | null>(null);
  const [evalBarOn, setEvalBarOn] = useState(() => readSettings().evalBar);
  useEffect(() => {
    const sync = () => setEvalBarOn(readSettings().evalBar);
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);
  const toggleEvalBar = () => {
    const next = { ...readSettings(), evalBar: !evalBarOn };
    saveSettings(next);
    applySettings(next);
  };
  const lineState = line ? stateAt(line) : null;
  const currentFen = lineState ? lineState.currentFen : '';

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
  // Hover / keyboard focus previews a destination's result; a click pins it (and offers Play this move).
  const [hoverDest, setHoverDest] = useState<number | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [flipped, setFlipped] = useState(() => (initialPgn ? /\[Black "You"\]/.test(initialPgn) : initPos?.turn === 'black'));
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
    setHoverDest(null);
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

  const startedFen = useRef<string | null>(initialFen && initPos ? initialFen : null);
  useEffect(() => {
    if (fen) {
      const setup = fenOps.parseFen(fen);
      const posRes = setup.isOk ? Chess.fromSetup(setup.unwrap()) : null;
      if (posRes?.isOk) {
        setValidFen(true);
        if (startedFen.current !== fen) {
          startedFen.current = fen;
          setFenLine(newLine(fen));
          setFlipped(posRes.unwrap().turn === 'black');
        }
      } else {
        setValidFen(false);
        startedFen.current = null;
        setFenLine(null);
      }
    } else {
      setValidFen(true);
      startedFen.current = null;
      setFenLine(null);
    }
  }, [fen]);

  // The analysed position is the one at the line's cursor; every move resets the selection.
  useEffect(() => {
    resetSelection();
    if (!currentFen) { setPosition(null); return; }
    const setup = fenOps.parseFen(currentFen);
    const posRes = setup.isOk ? Chess.fromSetup(setup.unwrap()) : null;
    if (posRes?.isOk) {
      const p = posRes.unwrap();
      setPosition(p);
      setShowMovesFor(p.turn);
    } else {
      setPosition(null);
    }
  }, [currentFen]);

  const loadPgn = (text: string) => {
    const r = lineFromPgn(text);
    if (!r.ok) { setPgnError(r.error); return; }
    setPgnError('');
    setPgnLine(goTo(r.line, 0));
    setFlipped(/\[Black "You"\]/.test(text));
  };

  const playHere = (from: number, to: number, animate = true) => {
    if (!line || !position) return;
    const piece = position.board.get(from);
    const promo = piece?.role === 'pawn' && ((to >> 3) === 7 || (to >> 3) === 0) ? 'queen' : undefined;
    const next = playOnLine(line, from, to, promo);
    if (next) setLine(next, { animate });
  };
  const step = (delta: number) => { if (line) setLine(goTo(line, line.cursor + delta)); };

  // ← / → step through the moves (not while typing or moving focus on the board).
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.defaultPrevented) return; // a control (the evaluation graph, a list) already handled the key
      if (t instanceof Element && t.closest('input, textarea, select, [role="grid"], [role="slider"], [role="listbox"]')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepRef.current(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepRef.current(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    if (!position || showMovesFor === position.turn) return currentFen;
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

    if (ignoreClickRef.current) { ignoreClickRef.current = false; return; } // the click after a long-press preview
    // Tap a legal square of the picked piece: the move is played (as in Play).
    if (selectedSquare !== null && canPlayNow && lineState && legalDestinations(lineState, selectedSquare).includes(index)) {
      playHere(selectedSquare, index);
      return;
    }
    if (color === showMovesFor) {
      // F6: tap again to cancel
      if (selectedSquare === index) {
        resetSelection();
        return;
      }
      // Select own piece
      setSelectedSquare(index);
      if (source === 'pgn') return; // game review: ratings only, no square labels
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

  const shownDest = destinationSquare ?? hoverDest;
  const selectedDestInfo = (shownDest !== null ? moves.find(m => m.move.to === getSquareName(shownDest)) : null) || null;
  // An unpinned preview clears shortly after the pointer (or keyboard focus) leaves the square,
  // unless the pointer moves onto the result panel to read it.
  const leaveTimer = useRef<number | null>(null);
  const cancelLeave = () => { if (leaveTimer.current) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null; } };
  const clearPreviewSoon = () => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => { leaveTimer.current = null; setHoverDest(null); }, 250);
  };
  useEffect(() => cancelLeave, []);
  const onDestHover = (index: number) => {
    if (destinationSquare !== null) return;
    // A legal square is previewed even before its label arrives (the dots show at once); the result fills in.
    const legal = moves.some(m => m.move.to === getSquareName(index))
      || (selectedSquare !== null && !!lineState && legalDestinations(lineState, selectedSquare).includes(index));
    if (legal) {
      cancelLeave();
      if (index !== hoverDest) { setHoverDest(index); setExpandedLevel(1); setExchangeStep(0); }
    }
  };
  const onDestLeave = (index: number) => { if (destinationSquare === null && index === hoverDest) clearPreviewSoon(); };
  // Touch: a long press on a highlighted square previews it (a tap plays the move).
  const ignoreClickRef = useRef(false);
  const pressTimer = useRef<number | null>(null);
  const clearPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };
  useEffect(() => clearPress, []);
  const onSquarePointerDown = (index: number, pointerType: string) => {
    clearPress();
    if (pointerType === 'mouse' || source !== 'fen' || !moves.some(m => m.move.to === getSquareName(index))) return;
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      ignoreClickRef.current = true;
      cancelLeave();
      setHoverDest(index); setExpandedLevel(1); setExchangeStep(0);
    }, 450);
  };
  // Opening the details of a previewed move pins it, so moving the mouse doesn't swap it away.
  const setLevel = (lvl: number) => { if (destinationSquare === null && hoverDest !== null) setDestinationSquare(hoverDest); setExpandedLevel(lvl); };
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
    liveText = "Hover or tap a square to see why.";
  } else if (selectedSquare === null && !resultMessage) {
    liveText = "Tap one of your pieces to check where it can go.";
  }

  const path = line ? pathOf(line) : [];
  const exploring = !!line && isExploring(line);
  const lastMoveObj = line && line.cursor > 0 ? (() => {
    const u = path[line.cursor - 1].uci;
    const sqi = (x: string) => (x.charCodeAt(1) - 49) * 8 + (x.charCodeAt(0) - 97);
    return { from: sqi(u.slice(0, 2)), to: sqi(u.slice(2, 4)) };
  })() : undefined;
  const canPlayNow = !!position && showMovesFor === position.turn && !position.isEnd();
  const movableSquares = canPlayNow && position ? Array.from(position.board[position.turn]) : [];
  const [startTurn, , , , startFull] = (line?.startFen.split(' ') ?? []).slice(1);
  const startPly = ((Number(startFull) || 1) - 1) * 2 + (startTurn === 'b' ? 1 : 0);
  const moveLabel = (i: number) => {
    const n = startPly + i;
    return n % 2 === 0 ? `${n / 2 + 1}.` : i === 0 ? `${Math.floor(n / 2) + 1}...` : '';
  };
  // Engine review of the line on the board (and the whole game in PGN mode).
  const pathKey = path.map(m => m.uci).join(' ');
  const fens = useMemo(() => (line ? fensOf(line) : []), [line?.startFen, pathKey]);
  const gameInfo = useMemo(() => {
    if (source !== 'pgn' || !line) return null;
    const g = { ...line, branchAt: null, branch: [] };
    return { startFen: line.startFen, ucis: line.game.map(m => m.uci), fens: fensOf(g), moves: line.game };
  }, [source, line?.startFen, line?.game]);
  const review = useLineReview(engineClient, fens, path, currentFen || null, gameInfo, createReviewSearcher);
  const cursor = line?.cursor ?? 0;
  const currentEval = review.evals[cursor];
  // "Show the better move": the board goes back to the position before the move, with the engine's choice drawn
  // there (a move from the earlier position can't be drawn on the board after the move: its piece has moved).
  const moveId = cursor > 0 && path[cursor - 1] ? `${cursor}-${path[cursor - 1].uci}` : null;
  const reviewed = cursor > 0 ? review.reviews[cursor - 1] : undefined;
  const canShowBetter = !!reviewed && !reviewed.playedIsBest && !!reviewed.bestUci && !!reviewed.bestSan;
  const previewing = canShowBetter && moveId !== null && betterFor === moveId;
  const shownIdx = previewing ? cursor - 1 : cursor;
  const shownFen = previewing ? fens[cursor - 1] : currentFen;
  const shownEval = review.evals[shownIdx];
  const barKnown = !!shownEval && (shownEval.lines.length > 0 || !!shownEval.terminal);
  const barScore = barKnown ? whiteScore(shownFen, shownEval!) : null;
  const barLabel = barKnown ? evalLabel(shownFen, shownEval!) : undefined;
  const previewPos = useMemo(() => {
    if (!previewing) return null;
    const setup = fenOps.parseFen(shownFen);
    const p = setup.isOk ? Chess.fromSetup(setup.unwrap()) : null;
    return p && p.isOk ? p.unwrap() : null;
  }, [previewing, shownFen]);
  const lastReview: MoveReview | undefined = cursor > 0 ? review.reviews[cursor - 1] : undefined;
  // The game summary covers the loaded game's moves (it stays put while you explore your own line).
  const summaryMoves = review.game ? (line?.game ?? []) : path;
  const summaryReviews = review.game ? review.game.reviews : review.reviews;
  const rated = summaryMoves.map((m, i) => ({ m, r: summaryReviews[i] })).filter((x): x is { m: typeof x.m; r: MoveReview } => !!x.r);
  const summary = summarize(rated.map(x => x.m), rated.map(x => x.r));
  const graphText = (i: number): string => {
    const where = i === 0 ? 'Start position' : `After ${moveLabel(i - 1) || `${Math.floor((startPly + i - 1) / 2) + 1}...`} ${path[i - 1]?.san ?? ''}`;
    const e = review.evals[i];
    return e ? `${where}, ${evalLabel(fens[i], e)}` : where;
  };
  const graphValues = review.evals.map((e, i) => (e && (e.lines.length > 0 || e.terminal) ? winPercent(whiteScore(fens[i], e)) : null));
  const bestNext = currentEval?.lines[0]?.uci;
  // Arrows. On the board after a move: the opponent's best reply after a bad move (red, dashed). At the start of a
  // line: the best move. The better move the mover had is drawn on the position before the move (see above).
  const toArrow = (u: string, kind: 'best' | 'threat'): BoardArrow => ({ from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, kind });
  const arrowOptions: BoardArrow[] = cursor > 0
    ? (lastReview?.threat ? [toArrow(lastReview.threat.uci, 'threat')] : [])
    : bestNext ? [toArrow(bestNext, 'best')] : [];
  const arrows = previewing && reviewed?.bestUci ? [toArrow(reviewed.bestUci, 'best')] : showBest ? arrowOptions : [];
  const lastMover = cursor > 0 ? path[cursor - 1]?.color : undefined;
  const playedLabel = cursor > 0 && path[cursor - 1] ? `${moveLabel(cursor - 1) || `${Math.floor((startPly + cursor - 1) / 2) + 1}...`} ${path[cursor - 1].san}` : '';
  const arrowsNote = previewing && reviewed?.bestSan
    ? `Green arrow: ${reviewed.bestSan}, the better move, on the position before ${playedLabel}.`
    : arrows.length === 0 ? ''
      : cursor === 0
        ? `Green arrow: the best move here (${currentEval?.lines[0] ? sanOfUci(currentFen, currentEval.lines[0].uci) : ''}).`
        : lastReview?.threat ? `Red dashed arrow: ${lastMover === 'white' ? 'Black' : 'White'}'s best reply, ${lastReview.threat.san}.` : '';
  // The move's rating on the square it landed on; Brilliant and Great moves get an effect.
  const lastMove = cursor > 0 ? path[cursor - 1] : undefined;
  const moveBadge: MoveBadge | null = lastMove && lastReview && !previewing ? {
    square: (lastMove.uci.charCodeAt(3) - 49) * 8 + (lastMove.uci.charCodeAt(2) - 97),
    glyph: RATING_INFO[lastReview.rating].glyph,
    label: RATING_INFO[lastReview.rating].text,
    color: RATING_INFO[lastReview.rating].color,
    textColor: RATING_INFO[lastReview.rating].textColor,
    effect: lastReview.rating === 'brilliant' || lastReview.rating === 'great' ? lastReview.rating : null,
    id: `${cursor}-${lastMove.uci}-${lastReview.rating}`,
  } : null;
  const legalFrom = selectedSquare !== null && canPlayNow && lineState ? legalDestinations(lineState, selectedSquare) : undefined;
  const whiteName = (initialPgn?.match(/\[White "([^"]*)"\]/)?.[1]) || 'White';
  const blackName = (initialPgn?.match(/\[Black "([^"]*)"\]/)?.[1]) || 'Black';

  const NavIcon: React.FC<{ d: string }> = ({ d }) => (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );

  return (
    <div className="rv-analysis" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="rv-hero-bg rv-page-bg" aria-hidden="true">
        <div className="rv-hero-floor" />
        <div className="rv-page-glow" />
      </div>
      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>

      <div className="mode-bar" style={{ background: 'var(--panel)', color: 'var(--text-muted)', padding: '10px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
        <svg aria-hidden="true" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        ANALYSIS · Results are shown immediately
      </div>

      <div className="analysis-source" style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
        <RvSelect label="Analyze from" value={source} options={SOURCES} onChange={(v) => { setSource(v); resetSelection(); }} />
      </div>

      {source === 'pgn' && !pgnLine && (
        <div className="rv-rise" style={{ padding: '32px 24px', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
          <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', maxWidth: '720px' }}>
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 8px' }}>Analyze a whole game</h2>
            <p style={{ color: 'var(--text-2)', marginTop: 0 }}>Paste a game in PGN, then step through it move by move. You can try your own moves from any point.</p>
            <textarea aria-label="PGN" value={pgnText} onChange={(e) => { setPgnText(e.target.value); setPgnError(''); }} placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'} rows={6} style={{ width: '100%', padding: '12px', background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.9rem', resize: 'vertical' }} />
            {pgnError && <p role="alert" style={{ color: 'var(--accent-text)', margin: '8px 0 0' }}>{pgnError}</p>}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
              <button className="rv-btn rv-btn--primary" disabled={!pgnText.trim()} onClick={() => loadPgn(pgnText)}>Load game</button>
              <button className="rv-btn" onClick={() => setSource('fen')}>Analyze one position (FEN)</button>
            </div>
          </div>
        </div>
      )}

      {source === 'games' && (
        <div className="rv-rise" style={{ padding: '32px 24px', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
          <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', margin: 0 }}>My games</h2>
              <span className="rv-soon">Coming soon</span>
            </div>
            <p style={{ color: 'var(--text-2)', marginTop: 0 }}>Once accounts are ready, the games you play here are saved, and you can pick one to analyze.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
              <button className="rv-btn rv-btn--primary" onClick={() => onNavigate?.('play')}>Play a game</button>
              <button className="rv-btn" onClick={() => setSource('fen')}>Analyze one position (FEN)</button>
            </div>
          </div>
        </div>
      )}

      {source === 'games' || (source === 'pgn' && (!pgnLine || !position)) ? null : !position ? (
        <div style={{ padding: '40px 24px', maxWidth: '1320px', margin: '0 auto', width: '100%' }}>
          <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 8px' }}>Paste a position (FEN)</h2>
            <p style={{ color: 'var(--text-2)', marginTop: 0 }}>Copy a FEN from any chess site, or use Analyze this position while you play. You can move pieces for both sides from there.</p>
            <div>
              <input aria-label="FEN" type="text" value={inputFen} onChange={handleFenChange} placeholder="Paste FEN here" 
                style={{ width: '100%', maxWidth: '640px', fontFamily: 'IBM Plex Mono, monospace', minHeight: '44px', padding: '10px 12px', background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '1rem' }} 
              />
              {!validFen && <div style={{ color: 'var(--accent-text)', marginTop: '8px', fontSize: '0.9rem' }}>This position isn't valid. Check the FEN.</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="analysis-layout">
          {/* Top toolbar */}
          <div className="analysis-toolbar" style={{ background: 'var(--panel)', padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            {source === 'pgn' && line ? (
              <div style={{ flex: 1, minWidth: '240px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <strong>Game · {line.game.length} moves{line.result && line.result !== '*' ? ` · ${line.result}` : ''}</strong>
                <button className="rv-btn" onClick={() => { setPgnLine(null); resetSelection(); }}>Load another game</button>
              </div>
            ) : (
            <div style={{ flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>FEN</span>
              <input aria-label="FEN" type="text" value={inputFen} onChange={handleFenChange} style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'IBM Plex Mono, monospace', minHeight: '44px' }} 
              />
            </div>
            )}
            {source === 'fen' && <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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

            </div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="rv-hover" 
                onClick={() => setFlipped(!flipped)}
                style={{ background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
              >
                Flip Board
              </button>
              {source === 'fen' && <button className="rv-hover" 
                onClick={() => { resetSelection(); setFen(''); setInputFen(''); }}
                style={{ background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
              >
                Change position
              </button>}
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
              <div className={`rv-an-boardrow${evalBarOn ? ' rv-an-boardrow--bar' : ''}`}>
              {evalBarOn && <EvalBar score={barScore} flipped={flipped} label={barLabel} />}
              <div className="rv-an-boardwrap">
              {review.done + review.missing < review.total && <div className="rv-progress" aria-hidden="true" />}
              <Board
                position={previewPos ?? position}
                readOnly={previewing}
                flipped={flipped}
                onSquareClick={onSquareClick}
                selectedSquare={selectedSquare}
                destinationSquare={source === 'fen' ? shownDest : null}
                moves={source === 'fen' ? moves : []}
                legalDestinations={legalFrom}
                arrows={arrows}
                moveBadge={moveBadge}
                animateMoves={anim?.moves}
                animationKey={anim?.key}
                onSquarePointerDown={onSquarePointerDown}
                onSquarePointerUp={clearPress}
                onSquarePointerCancel={clearPress}
                onSquareMouseEnter={source === 'fen' ? onDestHover : undefined}
                onSquareMouseLeave={source === 'fen' ? onDestLeave : undefined}
                expandedLevel={expandedLevel}
                exchangeStep={exchangeStep}
                selectedDestInfo={selectedDestInfo}
                focusedSquare={focusedSquare}
                setFocusedSquare={setFocusedSquare}
                lastMove={previewing ? undefined : lastMoveObj}
                draggableSquares={movableSquares}
                onPieceDrop={(from, to) => playHere(from, to, false)}
                onPieceDragStart={(from) => { if (selectedSquare !== from) void onSquareClick(from); }}
              />
              </div>
              </div>
              
              {source === 'fen' && <div style={{ padding: '16px 24px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
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
              </div>}

              <div className="rv-an-nav" role="group" aria-label="Move navigation">
                <button className="rv-btn" aria-label="Go to start" disabled={!line || line.cursor === 0} onClick={() => line && setLine(goTo(line, 0), { animate: false })}><NavIcon d="M18 18l-6-6 6-6M8 6v12" /></button>
                <button className="rv-btn" aria-label="Previous move" disabled={!line || line.cursor === 0} onClick={() => step(-1)}><NavIcon d="M15 18l-6-6 6-6" /></button>
                <span className="rv-an-where" aria-live="polite">
                  {!line || line.cursor === 0 ? 'Start position' : previewing ? `Before ${playedLabel}` : `After ${playedLabel}`}
                </span>
                <button className="rv-btn" aria-label="Next move" disabled={!line || line.cursor >= path.length} onClick={() => step(1)}><NavIcon d="M9 18l6-6-6-6" /></button>
                <button className="rv-btn" aria-label="Go to end" disabled={!line || line.cursor >= path.length} onClick={() => line && setLine(goTo(line, path.length), { animate: false })}><NavIcon d="M6 18l6-6-6-6M16 6v12" /></button>
              </div>
              <div className="rv-an-tools">
                <button type="button" className="rv-btn rv-chiptoggle" aria-pressed={evalBarOn} onClick={toggleEvalBar}>Evaluation bar</button>
                <button type="button" className="rv-btn rv-chiptoggle" aria-pressed={showBest} onClick={() => setShowBest(v => !v)} disabled={arrowOptions.length === 0}>{cursor === 0 ? 'Show best move' : 'Show reply'}</button>
                {exploring && line && <button type="button" className="rv-btn rv-btn--primary" onClick={() => setLine(backToGame(line), { animate: false })}>Back to game line</button>}
              </div>
              {source === 'pgn' && <EvalGraph values={graphValues} cursor={cursor} valueText={graphText} onJump={(i) => line && setLine(goTo(line, i), { animate: false })} />}
            </div>
            
            <div className="rv-an-side" onMouseEnter={cancelLeave} onMouseLeave={() => { if (destinationSquare === null && hoverDest !== null) clearPreviewSoon(); }}>
            {source === 'pgn' && path.length > 0 && (
              <SummaryCard summary={summary} done={(review.game ?? review).done} total={(review.game ?? review).total} missing={(review.game ?? review).missing} onRetry={review.retry} whiteName={whiteName} blackName={blackName} />
            )}
            {path.length > 0 && (
              <MoveCard move={cursor > 0 ? path[cursor - 1] : null} label={cursor > 0 ? (moveLabel(cursor - 1) || `${Math.floor((startPly + cursor - 1) / 2) + 1}...`) : ''} review={lastReview} pending={review.done + review.missing < review.total} note={arrowsNote}
                better={canShowBetter && reviewed?.bestSan ? { san: reviewed.bestSan, showing: previewing, toggle: () => setBetterFor(previewing ? null : moveId) } : undefined} />
            )}
            {source === 'fen' && <ResultPanel
              selectedDestInfo={selectedDestInfo}
              expandedLevel={expandedLevel}
              setExpandedLevel={setLevel}
              exchangeStep={exchangeStep}
              setExchangeStep={setExchangeStep}
              stepText={stepText}
              emptyText={selectedSquare === null ? undefined : !analyzing && moves.length === 0 ? 'This piece has no legal moves.' : 'Hover over a highlighted square (or long-press it on a phone) to see what happens there. Tap it to play the move.'}
            />}
            <div className="rv-an-moves">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Moves</h3>
              </div>
              {exploring && line && line.branchAt !== null && (
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Your own moves are marked. The game continued with {line.game[line.branchAt]?.san ?? 'no more moves'}.</p>
              )}
              {path.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Play a move on the board: tap a piece, then a square (or drag it). You can move for both sides, and every move gets rated.</p>
              ) : (
                <div className="rv-movelist" aria-label="Moves">
                  {path.map((m, i) => {
                    const own = !!line && line.game.length > 0 && line.branchAt !== null && i >= line.branchAt;
                    const rv = review.reviews[i];
                    return (
                      <button key={i} type="button" className={'rv-mchip' + (own ? ' rv-mchip--own' : '')} aria-label={`${moveLabel(i) ? moveLabel(i) + ' ' : ''}${m.san}${own ? ' (your move)' : ''}`} aria-current={line?.cursor === i + 1 ? 'step' : undefined} onClick={() => line && setLine(goTo(line, i + 1), { animate: false })}>
                        {moveLabel(i) && <span className="rv-mchip-no">{moveLabel(i)}</span>}
                        <span className="mono">{m.san}</span>
                        {rv && <RatingChip rating={rv.rating} compact />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .analysis-layout { display: flex; flex-direction: column; }
        @media (max-width: 767px) {
          .board-container { width: 100%; max-width: none !important; }
          .board-container > div[role="grid"] { border-left: none !important; border-right: none !important; outline: none !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .board-container { padding: 16px; border-right: 1px solid var(--border); }
        }
        @media (min-width: 1024px) {
          .board-container { padding: 24px; border-right: 1px solid var(--border); }
        }
      `}</style>
    </div>
  );
};
