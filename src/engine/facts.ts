import { Result, PositionFacts } from './types.js';

export function getPositionFacts(fen: string): Result<PositionFacts> {
  // Dummy implementation for tests
  return { ok: false, error: { code: 'INVALID_FEN', message: 'Not implemented' } };
}
