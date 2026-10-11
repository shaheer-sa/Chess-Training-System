/** Piece designs (all GPL-compatible; credits in Settings › License). */
export const PIECE_SETS = [
  { id: 'cburnett', name: 'Classic', credit: 'Colin M. L. Burnett (GPLv2+)' },
  { id: 'merida', name: 'Merida', credit: 'Armando Hernandez Marroquin (GPLv2+)' },
  { id: 'fantasy', name: 'Fantasy', credit: 'Maurizio Monge (MIT)' },
  { id: 'spatial', name: 'Spatial', credit: 'Maurizio Monge (MIT)' },
  { id: 'celtic', name: 'Celtic', credit: 'Maurizio Monge (MIT)' },
  { id: 'chessnut', name: 'Chessnut', credit: 'Alexis Luengas (Apache 2.0)' },
] as const;
export type PieceSet = typeof PIECE_SETS[number]['id'];

/** Site preferences (per browser). Applied as classes on <html> so CSS can follow them. */
export interface SiteSettings {
  /** Fewer animations: no movement, fades and loading indicators stay. */
  reduceMotion: boolean;
  /** Letters and numbers along the board edges. */
  coordinates: boolean;
  /** The Rookvex loading screen on the first visit of a session. */
  loadingScreen: boolean;
  /** Evaluation bar beside the board in Analyze. */
  evalBar: boolean;
  /** Sound effects for moves, checks, the end of a game and special moves. */
  sound: boolean;
  /** Square labels on every legal square, or only on the square being pointed at (hover, focus, drag). */
  labelMode: 'all' | 'hover';
  /** The design of the pieces. */
  pieceSet: PieceSet;
}

export const SETTINGS_KEY = 'rookvex.settings.v1';
export const DEFAULT_SETTINGS: SiteSettings = { reduceMotion: false, coordinates: true, loadingScreen: true, evalBar: true, sound: true, labelMode: 'all', pieceSet: 'cburnett' };

export const loadSettings = (raw: string | null): SiteSettings => {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
    const d = data as Partial<Record<keyof SiteSettings, unknown>>;
    const b = (k: 'reduceMotion' | 'coordinates' | 'loadingScreen' | 'evalBar' | 'sound') => (typeof d[k] === 'boolean' ? (d[k] as boolean) : DEFAULT_SETTINGS[k]);
    return {
      reduceMotion: b('reduceMotion'), coordinates: b('coordinates'), loadingScreen: b('loadingScreen'), evalBar: b('evalBar'), sound: b('sound'),
      labelMode: d.labelMode === 'hover' ? 'hover' : 'all',
      pieceSet: PIECE_SETS.some(p => p.id === d.pieceSet) ? (d.pieceSet as PieceSet) : 'cburnett',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const readSettings = (): SiteSettings => {
  try { return loadSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return { ...DEFAULT_SETTINGS }; }
};

export const saveSettings = (s: SiteSettings): void => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked: settings last for this visit */ }
};

export const SETTINGS_EVENT = 'rookvex:settings';

export const applySettings = (s: SiteSettings, root: HTMLElement = document.documentElement): void => {
  root.classList.toggle('rv-reduce-motion', s.reduceMotion);
  root.classList.toggle('rv-no-coords', !s.coordinates);
  try { window.dispatchEvent(new Event(SETTINGS_EVENT)); } catch { /* no window (tests) */ }
};

/** True when the visitor asked for fewer animations: in Rookvex's settings or in the system settings. */
export const prefersReducedMotion = (): boolean => {
  try {
    return document.documentElement.classList.contains('rv-reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Update some settings: save, apply and tell every screen (one place for screens that change a setting). */
export const updateSettings = (patch: Partial<SiteSettings>): SiteSettings => {
  const next = { ...readSettings(), ...patch };
  saveSettings(next);
  applySettings(next);
  return next;
};
