import React, { useState, useEffect } from 'react';
import { Home } from './screens/Home.js';
import { Help } from './screens/Help.js';
import { AnalysisScreen } from './screens/AnalysisScreen.js';
import { EngineClient } from './engine/EngineClient.js';
import { AppShell } from './components/AppShell.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { GameState, newGame, deserializeGame } from './play/game.js';

export type ScreenName = 'home' | 'help' | 'analysis' | 'play';

export const App: React.FC<{ engineClient: EngineClient }> = ({ engineClient }) => {
  const getScreenFromHash = (): ScreenName => {
    const hash = window.location.hash;
    if (hash === '#/analyze') return 'analysis';
    if (hash === '#/play') return 'play';
    if (hash === '#/labels') return 'help';
    return 'home';
  };

  const [currentScreen, setCurrentScreen] = useState<ScreenName>(getScreenFromHash());
  
  useEffect(() => {
    const onHashChange = () => {
      const newScreen = getScreenFromHash();
      if (newScreen !== currentScreen) {
        setCurrentScreen(newScreen);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentScreen]);

  const [initialFen, setInitialFen] = useState<string>('');

  const navigate = (screen: ScreenName, fen?: string) => {
    if (screen === 'analysis' && currentScreen !== 'analysis') {
      setInitialFen(fen || '');
    }
    
    let newHash = '#/';
    if (screen === 'analysis') newHash = '#/analyze';
    if (screen === 'play') newHash = '#/play';
    if (screen === 'help') newHash = '#/labels';
    
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash);
    }
    setCurrentScreen(screen);
  };

  const [playGameState, setPlayGameState] = useState<GameState>(() => {
    try {
      const stored = localStorage.getItem('rookvex.play.v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        const g = deserializeGame(JSON.stringify({ startFen: parsed.startFen, moves: parsed.moves }));
        if (g) return g;
      }
    } catch {
      // ignore
    }
    return newGame();
  });
  
  const [playHintsOn, setPlayHintsOn] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('rookvex.play.v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.hintsOn === 'boolean') return parsed.hintsOn;
      }
    } catch {
      // ignore
    }
    return true;
  });

  const savePlayState = (g: GameState, h: boolean) => {
    setPlayGameState(g);
    setPlayHintsOn(h);
    try {
      localStorage.setItem('rookvex.play.v1', JSON.stringify({
        startFen: g.startFen,
        moves: g.moves.map(m => m.uci),
        hintsOn: h
      }));
    } catch {
      // ignore
    }
  };

  return (
    <AppShell onNavigate={navigate} currentScreen={currentScreen}>
      {currentScreen === 'home' && <Home onNavigate={navigate} engineClient={engineClient} />}
      {currentScreen === 'help' && <Help onNavigate={navigate} />}
      {currentScreen === 'analysis' && <AnalysisScreen engineClient={engineClient} initialFen={initialFen} onNavigate={navigate} />}
      {currentScreen === 'play' && <PlayScreen engineClient={engineClient} onNavigate={navigate} game={playGameState} hintsOn={playHintsOn} onGameStateChange={(g, h) => savePlayState(g, h)} initialFen={initialFen} />}
    </AppShell>
  );
};
