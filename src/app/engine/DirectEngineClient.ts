import { Result, MoveClassification, MoveInput, Square } from '../../engine/types';
import { EngineClient } from './EngineClient';
import { classifyMove, classifyMovesFrom } from '../../engine/classify';

export class DirectEngineClient implements EngineClient {
  async classifyMovesFrom(fen: string, from: Square): Promise<Result<MoveClassification[]>> {
    return classifyMovesFrom(fen, from);
  }

  async classifyMove(fen: string, move: MoveInput): Promise<Result<MoveClassification>> {
    return classifyMove(fen, move);
  }
}
