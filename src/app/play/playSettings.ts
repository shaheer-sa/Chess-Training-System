import type { BotLevel } from '../bot/levels.js';
import { GameState, newGame, deserializeGame, outcome } from './game.js';

export type PlayMode = 'two-player' | 'computer';

export interface PlaySettings {
  mode: PlayMode;
  level: BotLevel;
  humanColor: 'white' | 'black';
  hintsOn: boolean;
}

export const DEFAULT_SETTINGS: PlaySettings = {
  mode: 'two-player',
  level: 2,
  humanColor: 'white',
  hintsOn: true
};

export const serializeSavedPlay = (game: GameState, s: PlaySettings): string => {
  return JSON.stringify({
    startFen: game.startFen,
    moves: game.moves.map(m => m.uci),
    hintsOn: s.hintsOn,
    mode: s.mode,
    level: s.level,
    humanColor: s.humanColor
  });
};

export const loadSavedPlay = (raw: string | null): { game: GameState; settings: PlaySettings } => {
  if (!raw) return { game: newGame(), settings: DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(raw);
    const game = deserializeGame(JSON.stringify({ startFen: data.startFen, moves: data.moves }));
    if (!game) return { game: newGame(), settings: DEFAULT_SETTINGS };
    
    const settings: PlaySettings = {
      mode: data.mode === 'computer' ? 'computer' : 'two-player',
      level: [1, 2, 3, 4, 5, 6].includes(data.level) ? (data.level as BotLevel) : DEFAULT_SETTINGS.level,
      humanColor: data.humanColor === 'black' ? 'black' : 'white',
      hintsOn: typeof data.hintsOn === 'boolean' ? data.hintsOn : DEFAULT_SETTINGS.hintsOn
    };
    return { game, settings };
  } catch {
    return { game: newGame(), settings: DEFAULT_SETTINGS };
  }
};

export const isBotTurn = (game: GameState, s: PlaySettings): boolean => {
  if (s.mode !== 'computer' || outcome(game) !== null) return false;
  const sideToMove = game.currentFen.split(' ')[1] === 'w' ? 'white' : 'black';
  return sideToMove !== s.humanColor;
};

export const undoPlies = (game: GameState, s: PlaySettings): number => {
  const n = game.moves.length;
  if (s.mode === 'two-player') {
    return n > 0 ? 1 : 0;
  }
  
  const sideToMove = game.currentFen.split(' ')[1] === 'w' ? 'white' : 'black';
  if (sideToMove !== s.humanColor) {
    return n > 0 ? 1 : 0;
  } else {
    return n >= 2 ? 2 : 0;
  }
};
