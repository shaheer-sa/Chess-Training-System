import { Result, MoveClassification, MoveInput, Square } from '../../engine/types.js';
import { EngineClient } from './EngineClient.js';
import { classifyMove, classifyMovesFrom } from '../../engine/classify.js';

export class DirectEngineClient implements EngineClient {
  async classifyMovesFrom(fen: string, from: Square): Promise<Result<MoveClassification[]>> {
    return classifyMovesFrom(fen, from);
  }

  async classifyMove(fen: string, move: MoveInput): Promise<Result<MoveClassification>> {
    return classifyMove(fen, move);
  }
}
