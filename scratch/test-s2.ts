import { analyzeTactics } from '../src/engine/tactics.js';
const res = analyzeTactics('7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', { from: 'f2', to: 'e4' });
console.log(JSON.stringify(res.value.hangingAfterMove, null, 2));
