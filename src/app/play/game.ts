import { Chess, fen as fenOps, parseSquare, makeSquare, Square, Role, Color, Move } from 'chessops';
import { makeSan } from 'chessops/san';

export interface GameMove {
  /** Standard UCI with the king's target square for castling (e1g1), plus promotion letter. */
  uci: string;
  san: string;
  color: Color;
  role: Role;
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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMO_CHAR: Record<string, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
const PROMO_ROLE: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

const toPosition = (fen: string): Chess => Chess.fromSetup(fenOps.parseFen(fen).unwrap()).unwrap();

// chessops leaves an en passant square in the setup only when the capture is legal.
const repetitionKey = (pos: Chess): string => fenOps.makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');

const isCastlingTarget = (pos: Chess, from: Square, to: Square): boolean =>
  pos.board.get(from)?.role === 'king' && Math.abs(to - from) === 2;

/** chessops encodes castling as king-takes-own-rook; the UI uses the king's target square. */
const toChessopsMove = (pos: Chess, from: Square, to: Square, promotion?: Role): Move => {
  if (isCastlingTarget(pos, from, to)) {
    const rookSquare = to > from ? from | 7 : from & ~7;
    return { from, to: rookSquare };
  }
  return { from, to, promotion };
};

export const castlingRookMove = (from: number, to: number): { from: number; to: number } | null => {
  if (from === 4 && to === 6) return { from: 7, to: 5 }; // white short
  if (from === 4 && to === 2) return { from: 0, to: 3 }; // white long
  if (from === 60 && to === 62) return { from: 63, to: 61 }; // black short
  if (from === 60 && to === 58) return { from: 56, to: 59 }; // black long
  return null;
};

export const isPromotionMove = (game: GameState, from: Square, to: Square): boolean => {
  const pos = toPosition(game.currentFen);
  const rank = to >> 3;
  return pos.board.get(from)?.role === 'pawn' && (rank === 0 || rank === 7);
};

export const newGame = (fen?: string): GameState => {
  const startFen = fen || START_FEN;
  return { startFen, moves: [], currentFen: startFen, history: [repetitionKey(toPosition(startFen))] };
};

/** Legal destination squares in UI form (castling shown on the king's target square). */
export const legalDestinations = (game: GameState, from: Square): Square[] => {
  if (outcome(game)) return [];
  const pos = toPosition(game.currentFen);
  const piece = pos.board.get(from);
  if (!piece || piece.color !== pos.turn) return [];
  const result = new Set<Square>();
  for (const to of pos.dests(from)) {
    const target = pos.board.get(to);
    if (piece.role === 'king' && target && target.color === piece.color && target.role === 'rook') {
      result.add(to > from ? from + 2 : from - 2);
    } else {
      result.add(to);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
};

export const legalUciMoves = (game: GameState): string[] => {
  if (outcome(game)) return [];
  const pos = toPosition(game.currentFen);
  const ucis: string[] = [];
  for (let from = 0; from < 64; from++) {
    const square = from as Square;
    const piece = pos.board.get(square);
    if (piece && piece.color === pos.turn) {
      for (const to of legalDestinations(game, square)) {
        let uci = makeSquare(square) + makeSquare(to);
        if (isPromotionMove(game, square, to)) uci += 'q';
        ucis.push(uci);
      }
    }
  }
  return ucis.sort();
};

/** SAN for a move from the current position; promotions preview as queen. */
export const previewSan = (game: GameState, from: Square, to: Square): string | null => {
  const pos = toPosition(game.currentFen);
  const promotion = isPromotionMove(game, from, to) ? 'queen' : undefined;
  const move = toChessopsMove(pos, from, to, promotion);
  return pos.isLegal(move) ? makeSan(pos, move) : null;
};

export const playMove = (game: GameState, from: Square, to: Square, promotion?: Role): GameState | null => {
  if (outcome(game)) return null;
  const pos = toPosition(game.currentFen);
  const piece = pos.board.get(from);
  if (!piece) return null;
  const move = toChessopsMove(pos, from, to, promotion);
  if (!pos.isLegal(move)) return null;

  const san = makeSan(pos, move);
  const uci = makeSquare(from) + makeSquare(to) + (promotion ? PROMO_CHAR[promotion] : '');
  pos.play(move);

  return {
    ...game,
    moves: [...game.moves, { uci, san, color: piece.color, role: piece.role }],
    currentFen: fenOps.makeFen(pos.toSetup()),
    history: [...game.history, repetitionKey(pos)],
  };
};

export const undo = (game: GameState): GameState => {
  if (game.moves.length === 0) return game;
  let replay = newGame(game.startFen);
  for (const m of game.moves.slice(0, -1)) {
    const from = parseSquare(m.uci.slice(0, 2));
    const to = parseSquare(m.uci.slice(2, 4));
    if (from === undefined || to === undefined) break;
    const next = playMove(replay, from, to, m.uci.length > 4 ? PROMO_ROLE[m.uci[4]] : undefined);
    if (!next) break;
    replay = next;
  }
  return replay;
};

export const outcome = (game: GameState): Outcome | null => {
  const pos = toPosition(game.currentFen);
  if (pos.isCheckmate()) return { reason: 'checkmate', winner: pos.turn === 'white' ? 'black' : 'white' };
  if (pos.isStalemate()) return { reason: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { reason: 'insufficient material' };
  if (pos.halfmoves >= 100) return { reason: 'fifty-move rule' };
  const current = game.history[game.history.length - 1];
  if (game.history.filter(k => k === current).length >= 3) return { reason: 'threefold repetition' };
  return null;
};

export const capturedPieces = (game: GameState): { white: Role[], black: Role[] } => {
  const caps = { white: [] as Role[], black: [] as Role[] };
  const pos = toPosition(game.startFen);
  const promoted = new Set<number>();
  for (const m of game.moves) {
    const from = parseSquare(m.uci.slice(0, 2));
    const to = parseSquare(m.uci.slice(2, 4));
    if (from === undefined || to === undefined) continue;
    
    let capturedRole: Role | undefined = pos.board.get(to)?.role;
    if (pos.board.get(from)?.role === 'pawn' && pos.board.get(to) === undefined && from % 8 !== to % 8) {
      capturedRole = 'pawn';
    }
    
    if (capturedRole) {
      if (promoted.has(to) || pos.board.promoted.has(to)) capturedRole = 'pawn';
      if (pos.turn === 'white') caps.white.push(capturedRole);
      else caps.black.push(capturedRole);
    }
    
    promoted.delete(to);
    if (promoted.has(from)) {
      promoted.delete(from);
      promoted.add(to);
    }
    if (m.uci.length > 4) promoted.add(to);
    
    const move = toChessopsMove(pos, from, to, m.uci.length > 4 ? PROMO_ROLE[m.uci[4]] : undefined);
    pos.play(move);
  }
  return caps;
};

export const materialBalance = (game: GameState): number => {
  const pos = toPosition(game.currentFen);
  const values: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  let bal = 0;
  for (const sq of pos.board.white) bal += values[pos.board.get(sq)!.role];
  for (const sq of pos.board.black) bal -= values[pos.board.get(sq)!.role];
  return bal;
};

export const serializeGame = (game: GameState): string => {
  return JSON.stringify({
    startFen: game.startFen,
    moves: game.moves.map(m => m.uci)
  });
};

export const deserializeGame = (data: string): GameState | null => {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed.startFen !== 'string' || !Array.isArray(parsed.moves)) return null;
    let g = newGame(parsed.startFen);
    for (const uci of parsed.moves) {
      if (typeof uci !== 'string') return null;
      const from = parseSquare(uci.slice(0, 2));
      const to = parseSquare(uci.slice(2, 4));
      if (from === undefined || to === undefined) return null;
      const next = playMove(g, from, to, uci.length > 4 ? PROMO_ROLE[uci[4]] : undefined);
      if (!next) return null;
      g = next;
    }
    return g;
  } catch {
    return null;
  }
};

