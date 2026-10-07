import { getLegalMoves } from '../src/engine/rules.js';
const lm = getLegalMoves('7k/8/8/8/R1r1N3/8/8/K7 b - - 1 1');
console.log(lm.value.map(m => m.from + m.to));
