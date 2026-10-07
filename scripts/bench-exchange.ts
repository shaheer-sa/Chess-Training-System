import { analyzeExchange } from '../src/engine/exchange.js';
import { getLegalMoves } from '../src/engine/rules.js';

const POSITIONS = [
  { name: 'startpos', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
  { name: 'pos4', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1' },
  { name: 'pos4m', fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1' },
  { name: 'pos6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10' },
  { name: 'crowded', fen: '3r2bk/3q4/1np2n2/8/1N3N2/1B6/3Q4/3R3K w - - 0 1' },
];

const CROWDED_FEN = '3r2bk/3q4/1np2n2/8/1N3N2/1B6/3Q4/3R3K w - - 0 1';
const CROWDED_MOVE = { from: 'f4' as const, to: 'd5' as const };

async function runBenchmark() {
  console.log('=== EXCHANGE BENCHMARK ===\n');

  // (a) Crowded fixture alone
  const t0 = performance.now();
  analyzeExchange(CROWDED_FEN, CROWDED_MOVE);
  const crowdedTimeMs = performance.now() - t0;
  console.log(`(a) Crowded fixture alone: ${crowdedTimeMs.toFixed(2)} ms`);

  // (b) All legal moves of each corpus position
  console.log('\n(b) All legal moves per corpus position:');
  let grandTotalMs = 0;

  for (const pos of POSITIONS) {
    const lmRes = getLegalMoves(pos.fen);
    if (!lmRes.ok) {
      console.error(`Failed to get legal moves for ${pos.name}:`, lmRes.error);
      continue;
    }
    const moves = lmRes.value;

    const startPosTime = performance.now();
    for (const m of moves) {
      analyzeExchange(pos.fen, { from: m.from, to: m.to, promotion: m.promotion });
    }
    const elapsedMs = performance.now() - startPosTime;
    grandTotalMs += elapsedMs;

    console.log(`  ${pos.name.padEnd(10)} (${moves.length.toString().padStart(2)} moves): ${elapsedMs.toFixed(2)} ms`);
  }

  console.log(`\nAll-positions total: ${grandTotalMs.toFixed(2)} ms`);

  console.log('\n(c) analyzeTactics over every legal move of kiwipete:');
  const kiwiFen = POSITIONS.find(p => p.name === 'kiwipete')!.fen;
  const kiwiMovesRes = getLegalMoves(kiwiFen);
  if (kiwiMovesRes.ok) {
    const kiwiMoves = kiwiMovesRes.value;
    const tStartTactics = performance.now();
    for (const m of kiwiMoves) {
      const { analyzeTactics } = await import('../src/engine/tactics.js');
      analyzeTactics(kiwiFen, { from: m.from, to: m.to, promotion: m.promotion });
    }
    const tEndTactics = performance.now() - tStartTactics;
    console.log(`  Total ms: ${tEndTactics.toFixed(2)} ms`);
    console.log(`  Average per move: ${(tEndTactics / kiwiMoves.length).toFixed(2)} ms`);
  }
}

runBenchmark();
