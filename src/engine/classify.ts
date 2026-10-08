import { Result, MoveClassification, MoveInput, Square, Reason, ReasonCode, Role } from './types.js';
import { analyzeDestination } from './destination.js';
import { analyzeExchange } from './exchange.js';
import { analyzeTactics } from './tactics.js';
import { getPositionFacts } from './facts.js';
import { getLegalMoves } from './rules.js';
import { fromAlgebraic, toColor } from './chessops-utils.js';
import { Chess, fen as fenOps } from 'chessops';
import { makeFen } from 'chessops/fen';
import { getActualCapturedSquare } from './capture-utils.js';

export function classifyMove(fen: string, moveInput: MoveInput): Result<MoveClassification> {
  const destRes = analyzeDestination(fen, moveInput);
  if (!destRes.ok) return { ok: false, error: destRes.error };
  const dest = destRes.value;

  const exRes = analyzeExchange(fen, moveInput);
  if (!exRes.ok) return { ok: false, error: exRes.error };
  const ex = exRes.value;

  const tacRes = analyzeTactics(fen, moveInput);
  if (!tacRes.ok) return { ok: false, error: tacRes.error };
  const tac = tacRes.value;

  const factsRes = getPositionFacts(ex.fenAfter);
  if (!factsRes.ok) return { ok: false, error: factsRes.error };
  const factsAfter = factsRes.value;

  const posResult = Chess.fromSetup(fenOps.parseFen(fen).unwrap());
  const posBefore = posResult.unwrap();
  const moverColor = toColor(posBefore.turn);
  const opponentColor = moverColor === 'white' ? 'black' : 'white';

  const move = { from: moveInput.from, to: moveInput.to, promotion: moveInput.promotion };

  const refutedCapturers: Square[] = [];
  const matingMoves: { from: Square; to: Square; promotion?: Role }[] = [];
  let nonRefutedOptions = ex.captureOptions;
  
  if (!(tac.exchangeLineMate && tac.exchangeLineMate.matedColor === opponentColor)) {
    const nextOptions = [];
    for (const opt of ex.captureOptions) {
      const replayPos = Chess.fromSetup(fenOps.parseFen(ex.fenAfter).unwrap()).unwrap();
      replayPos.play({ from: fromAlgebraic(opt.capturer.square), to: fromAlgebraic(opt.captureSquare), promotion: opt.promotion });
      
      let refuted = false;
      if (!replayPos.isCheck()) {
        const afterCapFen = makeFen(replayPos.toSetup());
        const lmRes = getLegalMoves(afterCapFen);
        if (lmRes.ok) {
          const matingList = [];
          for (const m of lmRes.value) {
            const tempPos = replayPos.clone();
            tempPos.play({ from: fromAlgebraic(m.from), to: fromAlgebraic(m.to), promotion: m.promotion });
            if (tempPos.isCheck()) {
              const replyFen = makeFen(tempPos.toSetup());
              const lmRes2 = getLegalMoves(replyFen);
              if (lmRes2.ok && lmRes2.value.length === 0) {
                matingList.push(m);
              }
            }
          }
          if (matingList.length > 0) {
            matingList.sort((a, b) => fromAlgebraic(a.from) !== fromAlgebraic(b.from) ? fromAlgebraic(a.from) - fromAlgebraic(b.from) : fromAlgebraic(a.to) - fromAlgebraic(b.to));
            refuted = true;
            refutedCapturers.push(opt.capturer.square);
            matingMoves.push({ from: matingList[0].from, to: matingList[0].to, promotion: matingList[0].promotion });
          }
        }
      }
      
      if (!refuted) {
        nextOptions.push(opt);
      }
    }
    nonRefutedOptions = nextOptions;
  }

  let effectiveSee = ex.materialFromMove;
  let bestNonRefutedOption = null;
  if (nonRefutedOptions.length > 0) {
    let minRes = Infinity;
    for (const opt of nonRefutedOptions) {
      if (opt.resultForMover < minRes) {
        minRes = opt.resultForMover;
        bestNonRefutedOption = opt;
      }
    }
    effectiveSee = Math.min(ex.materialFromMove, minRes);
  }

  let destGain = ex.materialFromMove - ex.see;
  if (refutedCapturers.length > 0) {
    destGain = ex.materialFromMove - effectiveSee;
  }

  let causedHang = 0;
  for (const hang of tac.hangingAfterMove) {
    if ((hang.cause === 'defender_moved' || hang.cause === 'line_opened') && hang.opponentGain > causedHang) {
      causedHang = hang.opponentGain;
    }
  }
  const netMaterial = ex.materialFromMove - Math.max(destGain, causedHang);

  const reasons: Reason[] = [];
  const addReason = (code: ReasonCode, squares: Square[] = [], moves?: { from: Square; to: Square; promotion?: Role }[], amount?: number) => {
    reasons.push({ code, squares: squares.sort((a, b) => fromAlgebraic(a) - fromAlgebraic(b)), moves, amount });
  };

  // 1 ALLOWS_MATE_IN_ONE
  if (tac.allowsMateInOne.length > 0) {
    addReason('ALLOWS_MATE_IN_ONE', [], tac.allowsMateInOne);
  }
  
  // 2 EXCHANGE_LINE_MATE
  if (tac.exchangeLineMate && tac.exchangeLineMate.matedColor === moverColor) {
    addReason('EXCHANGE_LINE_MATE');
  }

  // 3 CAUSES_STALEMATE
  if (tac.causesStalemate) {
    addReason('CAUSES_STALEMATE');
  }

  // 4 EXCHANGE_LINE_MATES_OPPONENT
  if (tac.exchangeLineMate && tac.exchangeLineMate.matedColor === opponentColor) {
    addReason('EXCHANGE_LINE_MATES_OPPONENT');
  }

  if (refutedCapturers.length > 0) {
    addReason('CAPTURE_ALLOWS_MATE', refutedCapturers, matingMoves);
  }

  // RULE FORCED
  let forcedCaptureIgnored = false;
  const replayPos = Chess.fromSetup(fenOps.parseFen(ex.fenAfter).unwrap()).unwrap();
  for (const step of ex.bestLine) {
    replayPos.play({ from: fromAlgebraic(step.capturer.square), to: fromAlgebraic(step.to), promotion: step.promotion });
  }
  if (replayPos.isCheck()) {
    const rf = makeFen(replayPos.toSetup());
    const lm = getLegalMoves(rf);
    if (lm.ok && lm.value.length > 0) {
      const exchSq = ex.bestLine.length > 0 ? ex.bestLine[ex.bestLine.length - 1].to : moveInput.to;
      let allCaptureThere = true;
      for (const m of lm.value) {
        // We compare using the actual captured square. This correctly covers en passant semantics.
        // Current exchange sequencing makes a positive EP-triggered FORCED case unreachable, but the generic rule remains correct.
        const actualSq = getActualCapturedSquare({ from: m.from, to: m.to }, m.isCapture, m.isEnPassant);
        if (!actualSq || actualSq !== exchSq) {
          allCaptureThere = false;
          break;
        }
      }
      if (allCaptureThere) {
        forcedCaptureIgnored = true;
        addReason('FORCED_CAPTURE_IGNORED', [exchSq]);
      }
    }
  }

  // RULE DEFENDERS (only when effectiveSee < 0 AND bestNonRefutedOption exists)
  if (effectiveSee < 0 && bestNonRefutedOption) {
    const recs = dest.legalCaptures.find(c => c.capturer.square === bestNonRefutedOption.capturer.square)?.legalRecaptures || [];
    const unavailable = dest.geometricDefenders.filter(d => !recs.some(r => r.square === d.square));
    for (const u of unavailable) {
      if (factsAfter.pins.some(p => p.kind === 'absolute' && p.pinned.square === u.square)) {
        addReason('PINNED_DEFENDER', [u.square]);
      } else if (u.role === 'king') {
        addReason('KING_CANNOT_RECAPTURE', [u.square]);
      } else {
        addReason('DEFENDER_UNAVAILABLE', [u.square]);
      }
    }
    if (dest.geometricDefenders.length === 0 && recs.length === 0) {
      addReason('UNDEFENDED_PIECE_LOST');
    } else if (recs.length > 0) {
      addReason('BAD_EXCHANGE');
    }
  }

  // 11 DEFENDER_MOVED
  const defMoved = tac.hangingAfterMove.filter(h => h.cause === 'defender_moved');
  if (defMoved.length > 0) addReason('DEFENDER_MOVED', defMoved.map(h => h.piece.square));

  // 12 LINE_OPENED
  const lineOpened = tac.hangingAfterMove.filter(h => h.cause === 'line_opened');
  if (lineOpened.length > 0) addReason('LINE_OPENED', lineOpened.map(h => h.piece.square));

  // 13 PIECE_ALREADY_HANGING
  const alreadyHanging = tac.hangingAfterMove.filter(h => h.cause === 'other');
  if (alreadyHanging.length > 0) addReason('PIECE_ALREADY_HANGING', alreadyHanging.map(h => h.piece.square));

  // 14 EVEN_EXCHANGE
  // We don't know the label yet, wait.
  
  // 15 OPPONENT_CAPTURE_LOSES
  if (ex.captureOptions.length > 0 && ex.bestLine.length === 0 && !forcedCaptureIgnored) {
    addReason('OPPONENT_CAPTURE_LOSES');
  }

  // 16 ATTACKER_CANNOT_CAPTURE
  if (dest.geometricAttackers.length > 0 && dest.legalCaptures.length === 0) {
    addReason('ATTACKER_CANNOT_CAPTURE', dest.geometricAttackers.map(a => a.square));
  }

  // 17 NOT_ATTACKED
  if (dest.geometricAttackers.length === 0 && dest.legalCaptures.length === 0) {
    addReason('NOT_ATTACKED');
  }

  // 18 WINS_MATERIAL
  if (netMaterial > 0) {
    addReason('WINS_MATERIAL', [], undefined, netMaterial);
  }

  // 19 DELIVERS_MATE
  if (tac.deliversMate) {
    addReason('DELIVERS_MATE');
  }

  // 20 GIVES_CHECK
  if (tac.givesCheck && !tac.deliversMate) {
    addReason('GIVES_CHECK');
  }

  // 21 MOVER_PINNED
  if (tac.moverPinned) {
    addReason('MOVER_PINNED', [tac.moverPinned.pinner.square]);
  }

  // Calculate Label
  let label: 'safe' | 'even_trade' | 'loses_material' | 'unclear';
  if (tac.deliversMate) {
    label = 'safe';
  } else if (tac.causesStalemate) {
    label = 'unclear';
  } else if (tac.allowsMateInOne.length > 0 || (tac.exchangeLineMate && tac.exchangeLineMate.matedColor === moverColor)) {
    label = 'loses_material';
  } else if ((tac.exchangeLineMate && tac.exchangeLineMate.matedColor === opponentColor) || forcedCaptureIgnored) {
    label = 'unclear';
  } else if (netMaterial < 0) {
    label = 'loses_material';
  } else if (bestNonRefutedOption && bestNonRefutedOption.resultForMover <= ex.materialFromMove && netMaterial === 0) {
    label = 'even_trade';
  } else {
    label = 'safe';
  }

  // Now we can add 14 EVEN_EXCHANGE if label is even_trade.
  if (label === 'even_trade') {
    // Insert it in the correct order. The list of reasons must be sorted by ReasonCode as per the prompt's defined order.
    // Let's sort the reasons array at the end.
    addReason('EVEN_EXCHANGE');
  }

  const orderMap: Record<ReasonCode, number> = {
    'ALLOWS_MATE_IN_ONE': 1,
    'EXCHANGE_LINE_MATE': 2,
    'CAUSES_STALEMATE': 3,
    'EXCHANGE_LINE_MATES_OPPONENT': 4,
    'CAPTURE_ALLOWS_MATE': 5,
    'FORCED_CAPTURE_IGNORED': 6,
    'PINNED_DEFENDER': 7,
    'KING_CANNOT_RECAPTURE': 8,
    'DEFENDER_UNAVAILABLE': 9,
    'UNDEFENDED_PIECE_LOST': 10,
    'BAD_EXCHANGE': 11,
    'DEFENDER_MOVED': 12,
    'LINE_OPENED': 13,
    'PIECE_ALREADY_HANGING': 14,
    'EVEN_EXCHANGE': 15,
    'OPPONENT_CAPTURE_LOSES': 16,
    'ATTACKER_CANNOT_CAPTURE': 17,
    'NOT_ATTACKED': 18,
    'WINS_MATERIAL': 19,
    'DELIVERS_MATE': 20,
    'GIVES_CHECK': 21,
    'MOVER_PINNED': 22,
    'CASTLING_NOT_ANALYZED': 23
  };

  reasons.sort((a, b) => orderMap[a.code] - orderMap[b.code]);

  return {
    ok: true,
    value: {
      move,
      label,
      netMaterial,
      reasons,
      destination: dest,
      exchange: ex,
      tactics: tac
    }
  };
}

export function classifyMovesFrom(fen: string, from: Square): Result<MoveClassification[]> {
  const lm = getLegalMoves(fen);
  if (!lm.ok) return { ok: false, error: lm.error };
  const moves = lm.value.filter(m => m.from === from);
  if (moves.length === 0) {
    return { ok: false, error: { code: 'ILLEGAL_MOVE', message: 'No legal moves from square' } };
  }

  const results: MoveClassification[] = [];
  for (const m of moves) {
    if (m.promotion && m.promotion !== 'queen') continue;
    if (m.isCastling) {
      results.push({
        move: { from: m.from, to: m.to, promotion: m.promotion },
        label: 'unclear',
        netMaterial: 0,
        reasons: [{ code: 'CASTLING_NOT_ANALYZED', squares: [] }],
        destination: null,
        exchange: null,
        tactics: null
      });
    } else {
      const res = classifyMove(fen, { from: m.from, to: m.to, promotion: m.promotion });
      if (res.ok) {
        results.push(res.value);
      } else {
        return { ok: false, error: res.error };
      }
    }
  }

  results.sort((a, b) => fromAlgebraic(a.move.to) - fromAlgebraic(b.move.to));
  return { ok: true, value: results };
}
