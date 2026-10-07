import { Result, MoveClassification, MoveInput, Square } from '../../engine/types';

export interface EngineClient {
  classifyMovesFrom(fen: string, from: Square): Promise<Result<MoveClassification[]>>;
  classifyMove(fen: string, move: MoveInput): Promise<Result<MoveClassification>>;
}
