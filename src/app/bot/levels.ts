export type BotLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface LevelSettings {
  skill: number;
  depth: number;
  movetimeMs: number;
  randomMoveChance: number;
}

export const levelSettings = (level: BotLevel): LevelSettings => {
  switch (level) {
    case 1: return { skill: 0, depth: 1, movetimeMs: 50, randomMoveChance: 0.35 };
    case 2: return { skill: 2, depth: 2, movetimeMs: 100, randomMoveChance: 0.20 };
    case 3: return { skill: 5, depth: 4, movetimeMs: 200, randomMoveChance: 0.08 };
    case 4: return { skill: 9, depth: 6, movetimeMs: 400, randomMoveChance: 0 };
    case 5: return { skill: 14, depth: 10, movetimeMs: 800, randomMoveChance: 0 };
    case 6: return { skill: 20, depth: 14, movetimeMs: 1500, randomMoveChance: 0 };
  }
};
