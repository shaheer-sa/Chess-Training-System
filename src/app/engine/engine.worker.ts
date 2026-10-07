import { classifyMove, classifyMovesFrom } from '../../engine/classify.js';

self.onmessage = (e: MessageEvent) => {
  const { id, type, fen, from, move } = e.data;
  
  try {
    let result;
    if (type === 'classifyMovesFrom') {
      result = classifyMovesFrom(fen, from);
    } else if (type === 'classifyMove') {
      result = classifyMove(fen, move);
    }
    self.postMessage({ id, result });
  } catch (error: unknown) {
    self.postMessage({ 
      id, 
      result: { ok: false, error: { code: 'ILLEGAL_POSITION', message: error instanceof Error ? error.message : 'Unknown error' } } 
    });
  }
};
