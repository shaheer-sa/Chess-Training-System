import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';

import './app/styles/global.css';
import { WorkerEngineClient } from './app/engine/WorkerEngineClient.js';

const container = document.getElementById('root');
const root = createRoot(container!);
const engineClient = new WorkerEngineClient();

root.render(
  <React.StrictMode>
    <App engineClient={engineClient} />
  </React.StrictMode>
);
