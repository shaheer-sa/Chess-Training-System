import { getLegalMoves } from '../src/engine/rules.js';
const lm = getLegalMoves('k7/8/2b4p/6N1/8/8/6R1/7K b - - 0 1');
console.log(lm.value.filter(m => m.to === 'g2'));
