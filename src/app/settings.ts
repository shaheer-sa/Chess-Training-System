/** Site preferences (per browser). Applied as classes on <html> so CSS can follow them. */
export interface SiteSettings {
  /** Fewer animations: no movement, fades and loading indicators stay. */
  reduceMotion: boolean;
  /** Letters and numbers along the board edges. */
  coordinates: boolean;
  /** The Rookvex loading screen on the first visit of a session. */
  loadingScreen: boolean;
}

export const SETTINGS_KEY = 'rookvex.settings.v1';
export const DEFAULT_SETTINGS: SiteSettings = { reduceMotion: false, coordinates: true, loadingScreen: true };

export const loadSettings = (raw: string | null): SiteSettings => {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
    const d = data as Partial<Record<keyof SiteSettings, unknown>>;
    const pick = (k: keyof SiteSettings) => (typeof d[k] === 'boolean' ? (d[k] as boolean) : DEFAULT_SETTINGS[k]);
    return { reduceMotion: pick('reduceMotion'), coordinates: pick('coordinates'), loadingScreen: pick('loadingScreen') };
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

export const applySettings = (s: SiteSettings, root: HTMLElement = document.documentElement): void => {
  root.classList.toggle('rv-reduce-motion', s.reduceMotion);
  root.classList.toggle('rv-no-coords', !s.coordinates);
};
