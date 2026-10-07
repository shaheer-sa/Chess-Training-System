import React, { useState } from 'react';
import { Home } from './screens/Home.js';
import { Help } from './screens/Help.js';
import { AnalysisScreen } from './screens/AnalysisScreen.js';
import { WorkerEngineClient } from './engine/WorkerEngineClient.js';

import { EngineClient } from './engine/EngineClient.js';

export type ScreenName = 'home' | 'help' | 'analysis';

const defaultEngineClient = new WorkerEngineClient();

export const App: React.FC<{ engineClient?: EngineClient }> = ({ engineClient = defaultEngineClient }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [initialFen, setInitialFen] = useState<string>('');

  const navigate = (screen: ScreenName) => {
    if (screen === 'analysis' && currentScreen !== 'analysis') {
      setInitialFen('');
    }
    setCurrentScreen(screen);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', margin: 0, padding: 0 }}>
      {currentScreen === 'home' && <Home onNavigate={navigate} />}
      {currentScreen === 'help' && <Help onNavigate={navigate} />}
      {currentScreen === 'analysis' && <AnalysisScreen engineClient={engineClient} initialFen={initialFen} onNavigate={navigate} />}
    </div>
  );
};
