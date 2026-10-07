import { classifyMovesFrom } from '../src/engine/classify.js';
import { Square } from '../src/engine/types.js';

const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const pieces: Square[] = ['a1', 'b2', 'c2', 'd2', 'e2', 'f3', 'c3', 'e5', 'd5', 'e4', 'h2', 'g2', 'h1', 'e1', 'a2'];

const start = performance.now();
for (let i = 0; i < 100; i++) {
  for (const sq of pieces) {
    classifyMovesFrom(fen, sq);
  }
}
const end = performance.now();
console.log(`classifyMovesFrom for kiwipete (100 iterations) took ${end - start} ms`);
console.log(`Average per piece: ${(end - start) / (100 * pieces.length)} ms`);
