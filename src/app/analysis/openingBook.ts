/**
 * Opening book (phase 6D): positions from the Lichess opening list (CC0, public domain), so well-known opening
 * moves are not marked down by the engine at review depth. Loaded on demand (its own chunk).
 */

/** A position without the move counters, hashed to a short key (two 32-bit FNV-1a variants). */
export const bookKey = (fen: string): string => {
  const epd = fen.split(' ').slice(0, 4).join(' ');
  let a = 0x811c9dc5, b = 0x01000193 ^ epd.length;
  for (let i = 0; i < epd.length; i++) {
    const c = epd.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + (b >>> 20).toString(16).padStart(3, '0'); // hex: 44 bits
};

export interface OpeningBook {
  /** The position is in the book. */
  has(fen: string): boolean;
  /** The opening's name if a named line ends here. */
  name(fen: string): string | null;
}

export const makeBook = (data: { names: string[]; book: string }): OpeningBook => {
  const map = new Map<string, number>();
  for (const e of data.book.split(',')) {
    const [k, i] = e.split(':');
    map.set(k, i === undefined ? -1 : parseInt(i, 16));
  }
  return {
    has: (fen) => map.has(bookKey(fen)),
    name: (fen) => { const i = map.get(bookKey(fen)); return i === undefined || i < 0 ? null : data.names[i] ?? null; },
  };
};

let loading: Promise<OpeningBook> | null = null;
export const loadOpeningBook = (): Promise<OpeningBook> => {
  loading ??= import('./openingBook.data.js').then(m => makeBook({ names: m.OPENING_NAMES, book: m.OPENING_BOOK }));
  return loading;
};
