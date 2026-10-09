import { describe, it, expect } from 'vitest';
import { parseSquare, Role } from 'chessops';
import { newGame, playMove, undo, outcome, legalDestinations, GameState, capturedPieces, materialBalance, serializeGame, deserializeGame, castlingRookMove, legalUciMoves } from '../../src/app/play/game.js';

type Step = [from: string, to: string, promotion?: Role];

const sq = (name: string): number => {
  const s = parseSquare(name);
  if (s === undefined) throw new Error(`bad square ${name}`);
  return s;
};

/** Plays every step and fails the test if any move is rejected. */
const play = (fen: string | undefined, steps: Step[]): GameState => {
  let g = newGame(fen);
  for (const [from, to, promo] of steps) {
    const next = playMove(g, sq(from), sq(to), promo);
    if (!next) throw new Error(`move ${from}${to} rejected`);
    g = next;
  }
  return g;
};

const board = (g: GameState): string => g.currentFen.split(' ')[0];

describe('game.ts', () => {
  const cases: { name: string; fen?: string; steps: Step[]; check: (g: GameState) => void }[] = [
    { name: 'white castles kingside via king target square', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', steps: [['e1', 'g1']],
      check: g => { expect(board(g)).toBe('r3k2r/8/8/8/8/8/8/R4RK1'); expect(g.moves[0].san).toBe('O-O'); expect(g.moves[0].uci).toBe('e1g1'); } },
    { name: 'black castles queenside', fen: 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', steps: [['e8', 'c8']],
      check: g => { expect(board(g)).toBe('2kr3r/8/8/8/8/8/8/R3K2R'); expect(g.moves[0].san).toBe('O-O-O'); } },
    { name: 'en passant', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', steps: [['e5', 'd6']],
      check: g => { expect(board(g)).toBe('4k3/8/3P4/8/8/8/8/4K3'); expect(g.moves[0].san).toBe('exd6'); } },
    { name: 'under-promotion to knight', fen: '8/P7/8/8/8/8/8/4K2k w - - 0 1', steps: [['a7', 'a8', 'knight']],
      check: g => { expect(board(g)).toBe('N7/8/8/8/8/8/8/4K2k'); expect(g.moves[0].san).toBe('a8=N'); expect(g.moves[0].uci).toBe('a7a8n'); } },
    { name: "fool's mate", steps: [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']],
      check: g => { expect(outcome(g)).toEqual({ reason: 'checkmate', winner: 'black' }); expect(g.moves[3].san).toBe('Qh4#'); } },
    { name: 'stalemate', fen: '7k/5K2/8/6Q1/8/8/8/8 w - - 0 1', steps: [['g5', 'g6']],
      check: g => expect(outcome(g)).toEqual({ reason: 'stalemate' }) },
    { name: 'threefold repetition', steps: [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']],
      check: g => expect(outcome(g)).toEqual({ reason: 'threefold repetition' }) },
    { name: 'fifty-move rule', fen: '4k3/8/8/8/8/8/8/R3K3 w - - 99 80', steps: [['a1', 'a2']],
      check: g => expect(outcome(g)).toEqual({ reason: 'fifty-move rule' }) },
    { name: 'insufficient material after capture', fen: '4k3/8/8/8/8/8/3r4/3BK3 w - - 0 1', steps: [['e1', 'd2']],
      check: g => expect(outcome(g)).toEqual({ reason: 'insufficient material' }) },
  ];

  for (const c of cases) it(c.name, () => c.check(play(c.fen, c.steps)));

  it('castling is offered on the king target square, not the rook square', () => {
    const dests = legalDestinations(newGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), sq('e1'));
    expect(dests).toContain(sq('g1'));
    expect(dests).toContain(sq('c1'));
    expect(dests).not.toContain(sq('h1'));
    expect(dests).not.toContain(sq('a1'));
  });

  it('rejects illegal moves and promotion without a piece', () => {
    expect(playMove(newGame(), sq('e2'), sq('e5'))).toBeNull();
    expect(playMove(newGame('8/P7/8/8/8/8/8/4K2k w - - 0 1'), sq('a7'), sq('a8'))).toBeNull();
  });

  it('undo replays castling and promotion correctly', () => {
    const g = play('r3k2r/P7/8/8/8/8/8/R3K2R w KQkq - 0 1', [['e1', 'g1'], ['e8', 'c8'], ['a7', 'a8', 'queen']]);
    const back = undo(g);
    expect(back.moves.map(m => m.san)).toEqual(['O-O', 'O-O-O']);
    expect(board(back)).toBe('2kr3r/P7/8/8/8/8/8/R4RK1');
    expect(undo(undo(back)).currentFen).toBe(back.startFen);
  });

  it('accepts no moves after the game is over', () => {
    const g = play(undefined, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
    expect(playMove(g, sq('a2'), sq('a3'))).toBeNull();
    expect(legalDestinations(g, sq('a2'))).toEqual([]);
  });

  describe('capturedPieces', () => {
    it('tracks normal capture', () => {
      const g = play('4k3/8/8/8/3n4/4P3/8/4K3 w - - 0 1', [['e3', 'd4']]);
      expect(capturedPieces(g)).toEqual({ white: ['knight'], black: [] });
    });

    it('tracks en passant capture', () => {
      const g = play('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', [['e5', 'd6']]);
      expect(capturedPieces(g)).toEqual({ white: ['pawn'], black: [] });
    });

    it('capturing a promoted piece counts as a pawn', () => {
      const g = play('4k3/P7/8/8/8/8/r7/4K3 w - - 0 1', [['a7', 'a8', 'queen'], ['a2', 'a8']]);
      // white plays a8=Q
      // black plays Rxa8 capturing the promoted queen -> counts as a pawn!
      expect(capturedPieces(g)).toEqual({ white: [], black: ['pawn'] });
    });
  });

  describe('materialBalance', () => {
    it('returns material balance', () => {
      expect(materialBalance(newGame())).toBe(0);
      const g = play('rnbqkbnr/pppp1ppp/8/8/4p3/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1', [['f3', 'e5']]); // white knight moves
      expect(materialBalance(g)).toBe(0);
      // Let's create an imbalance
      const g2 = play('rnbqkbnr/pppp1ppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1', []);
      expect(materialBalance(g2)).toBe(1); // black is missing a pawn (on e5)
    });
  });

  describe('serializeGame / deserializeGame', () => {
    it('round-trips correctly', () => {
      const g = play(undefined, [['e2', 'e4'], ['e7', 'e5']]);
      const data = serializeGame(g);
      const g2 = deserializeGame(data);
      expect(g2?.currentFen).toBe(g.currentFen);
      expect(g2?.moves).toEqual(g.moves);
    });

    it('rejects corrupt data', () => {
      expect(deserializeGame('not json')).toBeNull();
      expect(deserializeGame(JSON.stringify({ startFen: 123, moves: [] }))).toBeNull();
      expect(deserializeGame(JSON.stringify({ startFen: 'invalid fen', moves: [] }))).toBeNull();
      expect(deserializeGame(JSON.stringify({ startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e5'] }))).toBeNull(); // illegal move
    });
  });

  describe('castlingRookMove', () => {
    it('identifies rook move for castlings, returns null otherwise', () => {
      expect(castlingRookMove(4, 6)).toEqual({ from: 7, to: 5 }); // white short
      expect(castlingRookMove(4, 2)).toEqual({ from: 0, to: 3 }); // white long
      expect(castlingRookMove(60, 62)).toEqual({ from: 63, to: 61 }); // black short
      expect(castlingRookMove(60, 58)).toEqual({ from: 56, to: 59 }); // black long
      expect(castlingRookMove(12, 28)).toBeNull(); // normal move (e2e4)
    });
  });
});

describe('legalUciMoves', () => {
  it('start position', () => {
    const game = newGame();
    const moves = legalUciMoves(game);
    expect(moves.length).toBe(20);
    expect(moves).toContain('e2e4');
    expect(moves).toContain('g1f3');
  });

  it('white can castle both ways', () => {
    // A position where white can castle short and long
    const game = newGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const moves = legalUciMoves(game);
    expect(moves).toContain('e1g1');
    expect(moves).toContain('e1c1');
  });

  it('white pawn on e7 with e8 empty', () => {
    const game = newGame('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
    const moves = legalUciMoves(game);
    expect(moves).toContain('e7e8q');
    expect(moves.some(m => m.startsWith('e7e8') && m !== 'e7e8q')).toBe(false); // No other promotions
  });

  it('checkmated position', () => {
    const game = newGame('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'); // Fool's mate
    const moves = legalUciMoves(game);
    expect(moves).toEqual([]);
  });
});
