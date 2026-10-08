import { Chess, fen as fenOps, parseSquare, Square, Role, Color, SquareName, Move } from 'chessops';
import { makeSan } from 'chessops/san';
import { makeUci } from 'chessops/util';

export interface GameMove {
  uci: string;
  san: string;
}

export interface GameState {
  startFen: string;
  moves: GameMove[];
  currentFen: string;
  history: string[]; // repetition keys
}

export type Outcome = 
  | { reason: 'checkmate'; winner: Color }
  | { reason: 'stalemate' | 'insufficient material' | 'threefold repetition' | 'fifty-move rule' };

const getRepetitionKey = (pos: Chess): string => {
  const fen = fenOps.makeFen(pos.toSetup());
  return fen.split(' ').slice(0, 4).join(' ');
};

export const newGame = (fen?: string): GameState => {
  const startFen = fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const pos = Chess.fromSetup(fenOps.parseFen(startFen).unwrap()).unwrap();
  return {
    startFen,
    moves: [],
    currentFen: startFen,
    history: [getRepetitionKey(pos)]
  };
};

export const legalDestinations = (game: GameState, from: Square): Square[] => {
  const pos = Chess.fromSetup(fenOps.parseFen(game.currentFen).unwrap()).unwrap();
  const dests: Square[] = [];
  const piece = pos.board.get(from);
  if (!piece || piece.color !== pos.turn) return dests;

  const squares = Array.from(pos.dests(from));
  for (const move of squares) {
    dests.push(move);
  }
  return dests;
};

export const playMove = (game: GameState, from: Square, to: Square, promotion?: Role): GameState | null => {
  const outcomeResult = outcome(game);
  if (outcomeResult) return null;

  const pos = Chess.fromSetup(fenOps.parseFen(game.currentFen).unwrap()).unwrap();
  
  const move: Move = { from, to, promotion };
  
  if (!pos.isLegal(move)) {
    return null; // illegal move
  }
  
  let san: string;
  try {
    san = makeSan(pos, move);
  } catch {
    return null;
  }
  
  const uci = makeUci(move);
  pos.play(move);
  
  const currentFen = fenOps.makeFen(pos.toSetup());
  const newKey = getRepetitionKey(pos);
  
  return {
    ...game,
    moves: [...game.moves, { uci, san }],
    currentFen,
    history: [...game.history, newKey]
  };
};

export const undo = (game: GameState): GameState => {
  if (game.moves.length === 0) return game;
  
  const newMoves = game.moves.slice(0, -1);
  const pos = Chess.fromSetup(fenOps.parseFen(game.startFen).unwrap()).unwrap();
  
  const history = [getRepetitionKey(pos)];
  for (const move of newMoves) {
    const fromStr = move.uci.substring(0, 2) as SquareName;
    const toStr = move.uci.substring(2, 4) as SquareName;
    const promoChar = move.uci.length > 4 ? move.uci[4] : undefined;
    
    let promotion: Role | undefined;
    if (promoChar === 'q') promotion = 'queen';
    else if (promoChar === 'r') promotion = 'rook';
    else if (promoChar === 'b') promotion = 'bishop';
    else if (promoChar === 'n') promotion = 'knight';
    
    pos.play({
      from: parseSquare(fromStr),
      to: parseSquare(toStr),
      promotion
    });
    history.push(getRepetitionKey(pos));
  }
  
  return {
    ...game,
    moves: newMoves,
    currentFen: fenOps.makeFen(pos.toSetup()),
    history
  };
};

export const outcome = (game: GameState): Outcome | null => {
  const pos = Chess.fromSetup(fenOps.parseFen(game.currentFen).unwrap()).unwrap();
  
  if (pos.isCheckmate()) {
    return { reason: 'checkmate', winner: pos.turn === 'white' ? 'black' : 'white' };
  }
  
  if (pos.isStalemate()) {
    return { reason: 'stalemate' };
  }
  
  if (pos.isInsufficientMaterial()) {
    return { reason: 'insufficient material' };
  }
  
  if (pos.halfmoves >= 100) {
    return { reason: 'fifty-move rule' };
  }
  
  const currentKey = game.history[game.history.length - 1];
  let count = 0;
  for (const key of game.history) {
    if (key === currentKey) count++;
  }
  if (count >= 3) {
    return { reason: 'threefold repetition' };
  }
  
  return null;
};
