import { analyzeTactics } from '../src/engine/tactics.js';
const res = analyzeTactics('k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', { from: 'e6', to: 'g5' });
console.log(JSON.stringify(res.value.hangingAfterMove, null, 2));
