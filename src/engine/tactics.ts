import { Result, TacticalReport, MoveInput } from './types.js';

export function analyzeTactics(fen: string, move: MoveInput): Result<TacticalReport> {
  // Dummy implementation for tests
  return { ok: false, error: { code: 'INVALID_FEN', message: 'Not implemented' } };
}
