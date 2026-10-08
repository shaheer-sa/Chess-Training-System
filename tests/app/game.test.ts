import { describe, test, expect } from 'vitest';
import { newGame, playMove, undo, outcome } from '../../src/app/play/game';
import { Chess, parseSquare } from 'chessops';

describe('Game state engine', () => {
  test('scenarios', () => {
    const cases = [
      {
        name: 'castling queenside',
        fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
        moves: [['e1', 'c1']],
        checkFn: (g: any) => expect(g.currentFen).toContain('2KR3R')
      },
      {
        name: 'castling kingside',
        fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
        moves: [['e1', 'g1']],
        checkFn: (g: any) => expect(g.currentFen).toContain('R4RK1')
      },
      {
        name: 'en passant',
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        moves: [['e5', 'd6']],
        checkFn: (g: any) => expect(g.currentFen).toContain('3P4')
      },
      {
        name: 'underpromotion to knight',
        fen: '8/P7/8/8/8/8/8/4K2k w - - 0 1',
        moves: [['a7', 'a8', 'knight']],
        checkFn: (g: any) => expect(g.currentFen).toContain('N7')
      },
      {
        name: "checkmate (fool's mate)",
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']],
        checkFn: (g: any) => expect(outcome(g)).toEqual({ reason: 'checkmate', winner: 'black' })
      },
      {
        name: 'stalemate',
        fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1',
        moves: [['g6', 'h6']], // not stalemate, wait: actually Kh8 Kf7 Qg6 is already stalemate for black? wait, let's just use Kh8, Kf7, and Queen moves to h6? No, stalemate fen: 7k/5K2/6Q1/8/8/8/8/8 b - - 0 1 is already stalemate.
        checkFn: null
      },
      {
        name: 'threefold repetition',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [
          ['g1', 'f3'], ['g8', 'f6'],
          ['f3', 'g1'], ['f6', 'g8'],
          ['g1', 'f3'], ['g8', 'f6'],
          ['f3', 'g1'], ['f6', 'g8']
        ],
        checkFn: (g: any) => expect(outcome(g)).toEqual({ reason: 'threefold repetition' })
      },
      {
        name: 'fifty-move rule',
        fen: '8/8/8/8/8/8/k7/1R5K w - - 99 50',
        moves: [['b1', 'c1']],
        checkFn: (g: any) => expect(outcome(g)).toEqual({ reason: 'fifty-move rule' })
      },
      {
        name: 'insufficient material',
        fen: '8/8/8/8/8/8/k7/7K w - - 0 1',
        moves: [['h1', 'g1']],
        checkFn: (g: any) => expect(outcome(g)).toEqual({ reason: 'insufficient material' })
      },
      {
        name: 'undo',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [['e2', 'e4']],
        checkFn: (g: any) => {
          const u = undo(g);
          expect(u.currentFen).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
          expect(u.moves.length).toBe(0);
        }
      },
      {
        name: 'no move after game over',
        fen: '8/8/8/8/8/8/k7/7K w - - 0 1', // insufficient material -> game over
        moves: [],
        checkFn: (g: any) => {
          const next = playMove(g, parseSquare('h1')!, parseSquare('g1')!);
          expect(next).toBeNull(); // cannot play if game is over
        }
      }
    ];

    cases[5].moves = []; // fix stalemate
    cases[5].fen = '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1';
    cases[5].checkFn = (g: any) => expect(outcome(g)).toEqual({ reason: 'stalemate' });

    for (const c of cases) {
      let g = newGame(c.fen);
      for (const m of c.moves) {
        g = playMove(g, parseSquare(m[0])!, parseSquare(m[1])!, m[2] as any) || g;
      }
      if (c.checkFn) c.checkFn(g);
    }
  });
});
