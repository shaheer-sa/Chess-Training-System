/**
 * Finished game reviews, saved in the browser so reopening a game is instant (phase 6).
 * Keeps the most recent MAX_GAMES games; anything unreadable is treated as not cached.
 */
import type { PositionEval } from './review.js';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const MAX_GAMES = 20;
const PREFIX = 'rookvex.review.v1:';
const INDEX = 'rookvex.review.v1.index';

/** FNV-1a hash of the game and the depth, as a short key. */
export const reviewKey = (startFen: string, ucis: string[], depth: number): string => {
  let h = 0x811c9dc5;
  const text = `${depth}|${startFen}|${ucis.join(' ')}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${ucis.length}`;
};

const isScore = (s: unknown): boolean =>
  !!s && typeof s === 'object' && (typeof (s as { cp?: unknown }).cp === 'number' || typeof (s as { mate?: unknown }).mate === 'number');

const isEval = (e: unknown): e is PositionEval => {
  if (!e || typeof e !== 'object') return false;
  const { lines, terminal } = e as { lines?: unknown; terminal?: unknown };
  if (terminal !== undefined && terminal !== 'checkmate' && terminal !== 'draw') return false;
  return Array.isArray(lines) && lines.every(l => !!l && typeof l === 'object' && typeof (l as { uci?: unknown }).uci === 'string'
    && isScore((l as { score?: unknown }).score) && Array.isArray((l as { pv?: unknown }).pv));
};

export const loadReview = (store: KeyValueStore, key: string, positions: number): PositionEval[] | null => {
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length !== positions || !data.every(isEval)) return null;
    return data;
  } catch {
    return null;
  }
};

export const saveReview = (store: KeyValueStore, key: string, evals: PositionEval[]): void => {
  try {
    let index: string[] = [];
    try { const raw = store.getItem(INDEX); index = raw ? (JSON.parse(raw) as string[]).filter(k => typeof k === 'string') : []; } catch { index = []; }
    index = [key, ...index.filter(k => k !== key)];
    for (const old of index.slice(MAX_GAMES)) store.removeItem(PREFIX + old);
    index = index.slice(0, MAX_GAMES);
    store.setItem(PREFIX + key, JSON.stringify(evals));
    store.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Storage full or blocked: the review still works, it just isn't kept.
  }
};
