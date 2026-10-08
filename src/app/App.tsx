import React, { useState } from 'react';
import { Home } from './screens/Home.js';
import { Help } from './screens/Help.js';
import { AnalysisScreen } from './screens/AnalysisScreen.js';
import { EngineClient } from './engine/EngineClient.js';
import TrainingScreen from './screens/TrainingScreen.js';
import { buildSession } from './training/session.js';
import { EXERCISES } from './training/exercises.js';
import { AppShell } from './components/AppShell.js';
import { PlayScreen } from './screens/PlayScreen.js';

export type ScreenName = 'home' | 'help' | 'analysis' | 'training' | 'play';

export const App: React.FC<{ engineClient: EngineClient }> = ({ engineClient }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [initialFen, setInitialFen] = useState<string>('');
  const [sessionKey, setSessionKey] = useState(0);

  const navigate = (screen: ScreenName) => {
    if (screen === 'analysis' && currentScreen !== 'analysis') {
      setInitialFen('');
    }
    if (screen === 'training' && currentScreen !== 'training') {
      setSessionKey(k => k + 1);
    }
    setCurrentScreen(screen);
  };

  const exercises = React.useMemo(() => buildSession(EXERCISES), [sessionKey]);

  return (
    <AppShell onNavigate={navigate} currentScreen={currentScreen}>
      {currentScreen === 'home' && <Home onNavigate={navigate} engineClient={engineClient} />}
      {currentScreen === 'help' && <Help onNavigate={navigate} />}
      {currentScreen === 'analysis' && <AnalysisScreen engineClient={engineClient} initialFen={initialFen} onNavigate={navigate} />}
      {currentScreen === 'training' && <TrainingScreen key={sessionKey} engineClient={engineClient} exercises={exercises} onExit={() => navigate('home')} onTrainAgain={() => setSessionKey(k => k + 1)} />}
      {currentScreen === 'play' && <PlayScreen engineClient={engineClient} onNavigate={navigate} />}
    </AppShell>
  );
};
