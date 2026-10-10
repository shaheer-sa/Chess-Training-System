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
}

export const SETTINGS_KEY = 'rookvex.settings.v1';
export const DEFAULT_SETTINGS: SiteSettings = { reduceMotion: false, coordinates: true, loadingScreen: true, evalBar: true, sound: true };

export const loadSettings = (raw: string | null): SiteSettings => {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
    const d = data as Partial<Record<keyof SiteSettings, unknown>>;
    const pick = (k: keyof SiteSettings) => (typeof d[k] === 'boolean' ? (d[k] as boolean) : DEFAULT_SETTINGS[k]);
    return { reduceMotion: pick('reduceMotion'), coordinates: pick('coordinates'), loadingScreen: pick('loadingScreen'), evalBar: pick('evalBar'), sound: pick('sound') };
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
