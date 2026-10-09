import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';

import './app/styles/global.css';
import { WorkerEngineClient } from './app/engine/WorkerEngineClient.js';
import { readSettings, applySettings } from './app/settings.js';

const siteSettings = readSettings();
applySettings(siteSettings);

const container = document.getElementById('root');
const root = createRoot(container!);
const engineClient = new WorkerEngineClient();

root.render(
  <React.StrictMode>
    <App engineClient={engineClient} />
  </React.StrictMode>
);

// Loading screen: on the first visit of a session it stays long enough to read the mark; later loads hide it
// as soon as the app has started.
const splash = document.getElementById('rv-splash');
if (splash) {
  let seen = false;
  try { seen = sessionStorage.getItem('rookvex.splash') === '1'; sessionStorage.setItem('rookvex.splash', '1'); } catch { /* storage blocked */ }
  window.setTimeout(() => {
    splash.classList.add('rv-splash--out');
    window.setTimeout(() => splash.remove(), 420);
  }, seen || !siteSettings.loadingScreen ? 0 : 1100);
}
