import { useEffect, useState } from 'react';
import { SETTINGS_EVENT, SiteSettings, readSettings } from './settings.js';

/** The site settings, kept up to date when they change anywhere (settings panel, a screen's options). */
export const useSiteSettings = (): SiteSettings => {
  const [s, setS] = useState(readSettings);
  useEffect(() => {
    const sync = () => setS(prev => { const next = readSettings(); return JSON.stringify(next) === JSON.stringify(prev) ? prev : next; });
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);
  return s;
};
