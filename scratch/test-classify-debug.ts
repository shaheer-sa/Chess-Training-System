import { classifyMove } from '../src/engine/classify.js';

console.log('S1:');
console.log(JSON.stringify(classifyMove('k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', {from: 'e6', to: 'g5'}).value?.reasons.map(r => r.code), null, 2));

console.log('S2:');
console.log(JSON.stringify(classifyMove('7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', {from: 'f2', to: 'e4'}).value?.reasons.map(r => r.code), null, 2));

console.log('Test PIECE_ALREADY_HANGING:');
console.log(JSON.stringify(classifyMove('4k3/8/8/8/8/8/7P/N5r1 w - - 0 1', {from: 'h2', to: 'h3'}).value?.reasons.map(r => r.code), null, 2));
