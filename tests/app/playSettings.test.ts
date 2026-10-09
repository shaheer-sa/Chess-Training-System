import { describe, it, expect } from 'vitest';
import { loadSavedPlay, serializeSavedPlay, isBotTurn, undoPlies, PlaySettings, DEFAULT_SETTINGS } from '../../src/app/play/playSettings.js';
import { newGame, playMove, GameState } from '../../src/app/play/game.js';
import { parseSquare } from 'chessops';

describe('playSettings', () => {
  describe('loadSavedPlay and serializeSavedPlay', () => {
    it('returns new game and default settings for null', () => {
      const { game, settings } = loadSavedPlay(null);
      expect(game.moves).toHaveLength(0);
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('returns new game and default settings for invalid JSON', () => {
      const { game, settings } = loadSavedPlay('invalid-json');
      expect(game.moves).toHaveLength(0);
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('loads old v1 data (startFen, moves, hintsOn) into two-player mode with defaults', () => {
      const startG = newGame();
      const raw = JSON.stringify({
        startFen: startG.startFen,
        moves: [],
        hintsOn: false
      });
      const { game, settings } = loadSavedPlay(raw);
      expect(game.startFen).toBe(startG.startFen);
      expect(settings).toEqual({ ...DEFAULT_SETTINGS, hintsOn: false });
    });

    it('round-trips full data', () => {
      const g = playMove(newGame(), parseSquare('e2')!, parseSquare('e4')!);
      const s: PlaySettings = { mode: 'computer', level: 5, humanColor: 'black', hintsOn: false };
      const raw = serializeSavedPlay(g!, s);
      const { game, settings } = loadSavedPlay(raw);
      expect(game.moves.length).toBe(1);
      expect(game.moves[0].uci).toBe('e2e4');
      expect(settings).toEqual(s);
    });

    it('reverts to default for invalid level or humanColor, keeping other fields', () => {
      const raw = JSON.stringify({
        startFen: newGame().startFen,
        moves: [],
        hintsOn: false,
        mode: 'computer',
        level: 9,
        humanColor: 'invalid'
      });
      const { settings } = loadSavedPlay(raw);
      expect(settings.mode).toBe('computer');
      expect(settings.hintsOn).toBe(false);
      expect(settings.level).toBe(DEFAULT_SETTINGS.level); // 2
      expect(settings.humanColor).toBe(DEFAULT_SETTINGS.humanColor); // 'white'
    });

    it('returns new game and defaults if move list is illegal', () => {
      const raw = JSON.stringify({
        startFen: newGame().startFen,
        moves: ['e2e5'], // Illegal move
        mode: 'computer',
        level: 4,
        humanColor: 'white',
        hintsOn: false
      });
      const { game, settings } = loadSavedPlay(raw);
      expect(game.moves).toHaveLength(0);
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('isBotTurn', () => {
    it('is always false in two-player mode', () => {
      const g = newGame();
      expect(isBotTurn(g, { ...DEFAULT_SETTINGS, mode: 'two-player' })).toBe(false);
      const g1 = playMove(g, parseSquare('e2')!, parseSquare('e4')!)!;
      expect(isBotTurn(g1, { ...DEFAULT_SETTINGS, mode: 'two-player' })).toBe(false);
    });

    it('is false for computer + human white at start', () => {
      const g = newGame();
      expect(isBotTurn(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(false);
    });

    it('is true after 1.e4 with human white', () => {
      const g = newGame();
      const g1 = playMove(g, parseSquare('e2')!, parseSquare('e4')!)!;
      expect(isBotTurn(g1, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(true);
    });

    it('is true at start with human black', () => {
      const g = newGame();
      expect(isBotTurn(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'black' })).toBe(true);
    });

    it('is false for finished game', () => {
      // Fool's mate
      let g = newGame();
      g = playMove(g, parseSquare('f2')!, parseSquare('f3')!)!;
      g = playMove(g, parseSquare('e7')!, parseSquare('e5')!)!;
      g = playMove(g, parseSquare('g2')!, parseSquare('g4')!)!;
      g = playMove(g, parseSquare('d8')!, parseSquare('h4')!)!;
      
      expect(isBotTurn(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(false);
    });
  });

  describe('undoPlies', () => {
    const applyMoves = (g: GameState, moves: string[]) => {
      let current = g;
      for (const m of moves) {
        const from = parseSquare(m.substring(0, 2))!;
        const to = parseSquare(m.substring(2, 4))!;
        current = playMove(current, from, to)!;
      }
      return current;
    };

    it('two-player: 0 if n=0', () => {
      const g = newGame();
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'two-player' })).toBe(0);
    });

    it('two-player: 1 if n>0', () => {
      const g = applyMoves(newGame(), ['e2e4']);
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'two-player' })).toBe(1);
    });

    it('computer, side to move is computer (n>0): 1', () => {
      // human white, made 1 move, now computer's turn
      const g = applyMoves(newGame(), ['e2e4']);
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(1);
    });

    it('computer, side to move is human (n>=2): 2', () => {
      // human white, 1 full turn (2 plies)
      const g = applyMoves(newGame(), ['e2e4', 'e7e5']);
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(2);
    });

    it('computer, side to move is human (n=0): 0', () => {
      const g = newGame();
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white' })).toBe(0);
    });

    it('computer, human black, n=1 (only computer first move exists): 0', () => {
      // computer white plays e4, human black to move
      const g = applyMoves(newGame(), ['e2e4']);
      expect(undoPlies(g, { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'black' })).toBe(0);
    });
  });
});
