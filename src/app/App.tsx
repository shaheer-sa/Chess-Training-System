import React, { useState, useEffect } from 'react';
import { Home } from './screens/Home.js';
import { Help } from './screens/Help.js';
import { AnalysisScreen } from './screens/AnalysisScreen.js';
import { EngineClient } from './engine/EngineClient.js';
import { AppShell } from './components/AppShell.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { GameState } from './play/game.js';
import { PlaySettings, loadSavedPlay, serializeSavedPlay } from './play/playSettings.js';

export type ScreenName = 'home' | 'help' | 'analysis' | 'play';
const SCREEN_LABEL: Record<ScreenName, string> = { home: 'Home', play: 'Play', analysis: 'Analyze', help: 'How labels work' };

export const App: React.FC<{ engineClient: EngineClient }> = ({ engineClient }) => {
  const getScreenFromHash = (): ScreenName => {
    const hash = window.location.hash;
    if (hash === '#/analyze') return 'analysis';
    if (hash === '#/play') return 'play';
    if (hash === '#/labels') return 'help';
    return 'home';
  };

  const [currentScreen, setCurrentScreen] = useState<ScreenName>(getScreenFromHash());
  // Screens this visit came through, so a screen opened from another one can offer "Back to …".
  const [trail, setTrail] = useState<ScreenName[]>([]);
  
  useEffect(() => {
    const onHashChange = () => {
      const newScreen = getScreenFromHash();
      if (newScreen !== currentScreen) {
        setTrail(t => (t.length > 0 && t[t.length - 1] === newScreen ? t.slice(0, -1) : newScreen === 'home' ? [] : [...t, currentScreen].slice(-10)));
        setCurrentScreen(newScreen);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentScreen]);

  const [initialFen, setInitialFen] = useState<string>('');
  const [initialPgn, setInitialPgn] = useState<string>('');

  const navigate = (screen: ScreenName, fen?: string, pgn?: string) => {
    if (screen === 'analysis' && currentScreen !== 'analysis') {
      setInitialFen(fen || '');
      setInitialPgn(pgn || '');
    }
    
    let newHash = '#/';
    if (screen === 'analysis') newHash = '#/analyze';
    if (screen === 'play') newHash = '#/play';
    if (screen === 'help') newHash = '#/labels';
    
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash);
    }
    if (screen !== currentScreen) setTrail(t => (screen === 'home' ? [] : [...t, currentScreen].slice(-10)));
    setCurrentScreen(screen);
  };

  const [savedPlay] = useState(() => {
    try {
      return loadSavedPlay(localStorage.getItem('rookvex.play.v1'));
    } catch {
      return loadSavedPlay(null);
    }
  });
  const [playGameState, setPlayGameState] = useState<GameState>(savedPlay.game);
  const [playSettings, setPlaySettings] = useState<PlaySettings>(savedPlay.settings);

  const savePlayState = (g: GameState, s: PlaySettings) => {
    setPlayGameState(g);
    setPlaySettings(s);
    try {
      localStorage.setItem('rookvex.play.v1', serializeSavedPlay(g, s));
    } catch {
      // ignore
    }
  };

  const backTo = currentScreen !== 'home' && trail.length > 0 ? trail[trail.length - 1] : null;
  const goBack = () => {
    if (!backTo) return;
    // Goes to the screen this one was opened from (a new history entry, so it also works after a refresh).
    setTrail(t => t.slice(0, -1));
    const hash = backTo === 'analysis' ? '#/analyze' : backTo === 'play' ? '#/play' : backTo === 'help' ? '#/labels' : '#/';
    window.history.pushState(null, '', hash);
    setCurrentScreen(backTo);
  };

  return (
    <AppShell onNavigate={navigate} currentScreen={currentScreen} backLabel={backTo ? SCREEN_LABEL[backTo] : undefined} onBack={goBack}>
      {currentScreen === 'home' && <Home onNavigate={navigate} engineClient={engineClient} />}
      {currentScreen === 'help' && <Help onNavigate={navigate} />}
      {currentScreen === 'analysis' && <AnalysisScreen engineClient={engineClient} initialFen={initialFen} initialPgn={initialPgn || undefined} onNavigate={navigate} />}
      {currentScreen === 'play' && <PlayScreen engineClient={engineClient} onNavigate={navigate} game={playGameState} settings={playSettings} onChange={(g, s) => savePlayState(g, s)} initialFen={initialFen} />}
    </AppShell>
  );
};
