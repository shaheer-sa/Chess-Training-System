import { describe, test, expect } from 'vitest';
import { newGame, legalDestinations, playMove, undo, outcome } from '../../src/app/play/game.js';
import { parseSquare } from 'chessops';

describe('Game Logic', () => {
  test('initialization and undo', () => {
    let game = newGame();
    expect(game.moves.length).toBe(0);
    expect(game.history.length).toBe(1);

    // Play e4
    game = playMove(game, parseSquare('e2'), parseSquare('e4'))!;
    expect(game.moves.length).toBe(1);
    expect(game.moves[0].san).toBe('e4');
    expect(game.history.length).toBe(2);

    // Undo e4
    game = undo(game);
    expect(game.moves.length).toBe(0);
    expect(game.history.length).toBe(1);
  });

  test('castling', () => {
    // A fen with castling rights
    let game = newGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    game = playMove(game, parseSquare('e1'), parseSquare('g1'))!; // kingside
    expect(game.moves[0].san).toBe('O-O');

    let game2 = newGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    game2 = playMove(game2, parseSquare('e1'), parseSquare('c1'))!; // queenside
    expect(game2.moves[0].san).toBe('O-O-O');
    
    let game3 = newGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    game3 = playMove(game3, parseSquare('e8'), parseSquare('g8'))!; // black kingside
    expect(game3.moves[0].san).toBe('O-O');
    
    let game4 = newGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    game4 = playMove(game4, parseSquare('e8'), parseSquare('c8'))!; // black queenside
    expect(game4.moves[0].san).toBe('O-O-O');
  });

  test('en passant', () => {
    let game = newGame('rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 1');
    const dests = legalDestinations(game, parseSquare('f5'));
    expect(dests.includes(parseSquare('e6'))).toBe(true);
    
    game = playMove(game, parseSquare('f5'), parseSquare('e6'))!;
    expect(game.moves[0].san).toBe('fxe6');
  });

  test('promotions', () => {
    const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    
    ['queen', 'rook', 'bishop', 'knight'].forEach(role => {
      let game = newGame(fen);
      game = playMove(game, parseSquare('a7')!, parseSquare('a8')!, role as Role)!;
      const expectedChar = role === 'knight' ? 'N' : role[0].toUpperCase();
      expect(game.moves[0].san).toContain(`a8=${expectedChar}`);
    });
  });

  test('checkmate', () => {
    // Fool's mate
    let game = newGame();
    game = playMove(game, parseSquare('f2'), parseSquare('f3'))!;
    game = playMove(game, parseSquare('e7'), parseSquare('e5'))!;
    game = playMove(game, parseSquare('g2'), parseSquare('g4'))!;
    game = playMove(game, parseSquare('d8'), parseSquare('h4'))!;
    
    const res = outcome(game);
    expect(res).toEqual({ reason: 'checkmate', winner: 'black' });
    
    // No moves allowed after game over
    const after = playMove(game, parseSquare('a2'), parseSquare('a3'));
    expect(after).toBeNull();
  });

  test('stalemate', () => {
    // const game = newGame('k7/8/8/8/8/8/1R6/KR6 w - - 0 1'); // not stalemate yet
    // actually just use a known stalemate fen directly
    const stalemateGame = newGame('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
    const res = outcome(stalemateGame);
    expect(res).toEqual({ reason: 'stalemate' });
  });

  test('insufficient material', () => {
    const game = newGame('k7/8/8/8/8/8/8/K7 w - - 0 1'); // K v K
    const res = outcome(game);
    expect(res).toEqual({ reason: 'insufficient material' });
  });

  test('fifty-move rule', () => {
    let game = newGame('k7/8/8/8/8/8/8/K6R w - - 99 50');
    // Move king
    game = playMove(game, parseSquare('a1'), parseSquare('a2'))!;
    const res = outcome(game);
    expect(res).toEqual({ reason: 'fifty-move rule' });
  });

  test('threefold repetition', () => {
    let game = newGame('k7/8/8/8/8/8/8/K6R w - - 0 1'); // K+R v K so it doesn't trigger insufficient material
    game = playMove(game, parseSquare('a1'), parseSquare('a2'))!;
    game = playMove(game, parseSquare('a8'), parseSquare('a7'))!;
    game = playMove(game, parseSquare('a2'), parseSquare('a1'))!;
    game = playMove(game, parseSquare('a7'), parseSquare('a8'))!;
    game = playMove(game, parseSquare('a1'), parseSquare('a2'))!;
    game = playMove(game, parseSquare('a8'), parseSquare('a7'))!;
    game = playMove(game, parseSquare('a2'), parseSquare('a1'))!;
    game = playMove(game, parseSquare('a7'), parseSquare('a8'))!;
    
    const res = outcome(game);
    expect(res).toEqual({ reason: 'threefold repetition' });
  });
});
