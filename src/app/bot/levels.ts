export type BotLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Approximate playing strength per level, measured in engine-vs-engine matches (2026-10-10). */
export const LEVEL_ELO: Record<BotLevel, number> = { 1: 400, 2: 700, 3: 1000, 4: 1300, 5: 1600, 6: 2000 };

export interface LevelSettings {
  /** Stockfish Skill Level (0–20), used when limitElo is not set. */
  skill: number;
  /** Search depth limit (null = time only). */
  depth: number | null;
  movetimeMs: number;
  /** Chance of playing a random legal move instead of the engine's move. */
  randomMoveChance: number;
  /** Stockfish's own calibrated strength limiter (UCI_LimitStrength + UCI_Elo), when set. */
  limitElo?: number;
}

/**
 * Calibrated 2026-10-10 (each step ≈ 270–380 Elo in engine-vs-engine matches, 20–40 games per step):
 * levels 4–6 use Stockfish's strength limiter; level 3 adds 10 % random moves to the 1320 limiter;
 * levels 1–2 are Skill Level 0 at depth 1 with random moves (the limiter can't go below 1320).
 */
export const levelSettings = (level: BotLevel): LevelSettings => {
  switch (level) {
    case 1: return { skill: 0, depth: 1, movetimeMs: 50, randomMoveChance: 0.45 };
    case 2: return { skill: 0, depth: 1, movetimeMs: 50, randomMoveChance: 0.20 };
    case 3: return { skill: 20, depth: null, movetimeMs: 500, randomMoveChance: 0.10, limitElo: 1320 };
    case 4: return { skill: 20, depth: null, movetimeMs: 500, randomMoveChance: 0, limitElo: 1320 };
    case 5: return { skill: 20, depth: null, movetimeMs: 500, randomMoveChance: 0, limitElo: 1600 };
    case 6: return { skill: 20, depth: null, movetimeMs: 500, randomMoveChance: 0, limitElo: 2000 };
  }
};

/** UCI commands for one computer move at these settings (the engine keeps options between moves, so all are set every time). */
export const moveCommands = (s: LevelSettings, fen: string): string[] => [
  `setoption name UCI_LimitStrength value ${s.limitElo !== undefined}`,
  ...(s.limitElo !== undefined ? [`setoption name UCI_Elo value ${s.limitElo}`] : []),
  `setoption name Skill Level value ${s.skill}`,
  `position fen ${fen}`,
  s.depth !== null ? `go depth ${s.depth} movetime ${s.movetimeMs}` : `go movetime ${s.movetimeMs}`,
];
