/**
 * Analysis lines: a start position, an optional game line (from a PGN), and the player's own exploration.
 * Pure logic, no React. Moves reuse the Play move format (GameMove), so SAN, UCI and colours stay consistent.
 */
import { Chess, fen as fenOps, makeSquare, Role } from 'chessops';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { GameMove, GameState, newGame, playMove, outcome } from '../play/game.js';

export interface LineState {
  startFen: string;
  /** The loaded game (PGN main line). Empty when analysing a single position. */
  game: GameMove[];
  /** Ply where the player's own moves leave the game line (null = following the game). */
  branchAt: number | null;
  branch: GameMove[];
  /** Number of moves applied from the start (0 = start position). */
  cursor: number;
  /** PGN result tag, e.g. "1-0", when a game was loaded. */
  result?: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMO_ROLE: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

export const newLine = (startFen: string, game: GameMove[] = [], result?: string): LineState =>
  ({ startFen, game, branchAt: null, branch: [], cursor: 0, result });

/** The moves currently shown: the game up to the branch point, then the player's own moves. */
export const pathOf = (s: LineState): GameMove[] =>
  s.branchAt === null ? s.game : [...s.game.slice(0, s.branchAt), ...s.branch];

/** True when the player's own moves differ from a loaded game. */
export const isExploring = (s: LineState): boolean => s.game.length > 0 && s.branchAt !== null;

const replay = (startFen: string, moves: GameMove[]): GameState => {
  let g = newGame(startFen);
  for (const m of moves) {
    const next = playMove(g, uciFrom(m.uci), uciTo(m.uci), m.uci.length > 4 ? PROMO_ROLE[m.uci[4]] : undefined);
    if (!next) break;
    g = next;
  }
  return g;
};
const sq = (s: string): number => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const uciFrom = (uci: string) => sq(uci.slice(0, 2));
const uciTo = (uci: string) => sq(uci.slice(2, 4));

/** Game state at the cursor (start position plus the first `cursor` moves of the path). */
export const stateAt = (s: LineState): GameState => replay(s.startFen, pathOf(s).slice(0, s.cursor));

export const goTo = (s: LineState, cursor: number): LineState =>
  ({ ...s, cursor: Math.max(0, Math.min(cursor, pathOf(s).length)) });

/** Play a move at the cursor. Following the game's next move stays on the game line; anything else is the player's line. */
export const playOnLine = (s: LineState, from: number, to: number, promotion?: Role): LineState | null => {
  const here = stateAt(s);
  const next = playMove(here, from, to, promotion);
  if (!next) return null;
  const m = next.moves[next.moves.length - 1];
  const path = pathOf(s);
  if (path[s.cursor]?.uci === m.uci) return { ...s, cursor: s.cursor + 1 };
  if (s.branchAt === null || s.cursor < s.branchAt) {
    if (s.game[s.cursor]?.uci === m.uci) return { ...s, branchAt: null, branch: [], cursor: s.cursor + 1 };
    return { ...s, branchAt: s.cursor, branch: [m], cursor: s.cursor + 1 };
  }
  return { ...s, branch: [...s.branch.slice(0, s.cursor - s.branchAt), m], cursor: s.cursor + 1 };
};

/** Leave the player's line and return to the game at the move where it branched off. */
export const backToGame = (s: LineState): LineState =>
  ({ ...s, branchAt: null, branch: [], cursor: Math.min(s.branchAt ?? s.cursor, s.game.length) });

export type PgnLoad = { ok: true; line: LineState } | { ok: false; error: string };

/** Read the first game of a PGN (main line only). */
export const lineFromPgn = (text: string): PgnLoad => {
  const games = parsePgn(text);
  if (games.length === 0) return { ok: false, error: "No game found. Paste the moves of a game in PGN, like 1. e4 e5 2. Nf3." };
  const g = games[0];
  const startRes = startingPosition(g.headers);
  if (startRes.isErr) return { ok: false, error: "The game's starting position (FEN tag) isn't valid." };
  const pos = startRes.unwrap();
  if (pos.rules !== 'chess') return { ok: false, error: 'Only standard chess games can be analyzed.' };
  const chess = Chess.fromSetup(pos.toSetup()).unwrap();
  const startFen = fenOps.makeFen(chess.toSetup());
  let state = newGame(startFen);
  let ply = 0;
  for (const node of g.moves.mainline()) {
    const move = parseSan(chess, node.san);
    const moveNo = `${chess.fullmoves}${chess.turn === 'white' ? '.' : '...'} ${node.san}`;
    if (!move || !('from' in move)) return { ok: false, error: `Move ${moveNo} isn't legal in this game.` };
    const piece = chess.board.get(move.from);
    let to: number = move.to;
    // chessops castles king-takes-rook; the app uses the king's target square.
    if (piece?.role === 'king' && chess.board.get(move.to)?.color === piece.color) to = move.to > move.from ? move.from + 2 : move.from - 2;
    const next = playMove(state, move.from, to, move.promotion);
    if (!next) return { ok: false, error: `Move ${moveNo} isn't legal in this game.` };
    chess.play(move);
    state = next;
    ply++;
  }
  if (ply === 0) return { ok: false, error: 'This PGN has no moves.' };
  return { ok: true, line: newLine(startFen, state.moves, g.headers.get('Result')) };
};

const pad = (n: number) => String(n).padStart(2, '0');

/** PGN of a played game (for "Analyze this game"). */
export const pgnFromGame = (game: GameState, players: { white: string; black: string }, now = new Date()): string => {
  const o = outcome(game);
  const result = !o ? '*' : o.reason === 'checkmate' ? (o.winner === 'white' ? '1-0' : '0-1') : '1/2-1/2';
  const tags: [string, string][] = [
    ['Event', 'Rookvex game'], ['Site', 'Rookvex'], ['Date', `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`],
    ['White', players.white], ['Black', players.black], ['Result', result],
  ];
  if (game.startFen !== START_FEN) tags.push(['SetUp', '1'], ['FEN', game.startFen]);
  const [, turn, , , , full] = game.startFen.split(' ');
  let n = Number(full) || 1;
  let white = turn !== 'b';
  const parts: string[] = [];
  game.moves.forEach((m, i) => {
    if (white) parts.push(`${n}. ${m.san}`);
    else { parts.push(i === 0 ? `${n}... ${m.san}` : m.san); n++; }
    white = !white;
  });
  return `${tags.map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${[...parts, result].join(' ')}\n`;
};

export const squareName = (i: number): string => makeSquare(i);
