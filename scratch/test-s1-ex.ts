import { analyzeExchange } from '../src/engine/exchange.js';
const res = analyzeExchange('k7/8/2b4p/6N1/8/8/6R1/7K b - - 0 1', {from: 'c6', to: 'g2'});
console.log(JSON.stringify(res.value.bestLine, null, 2));
