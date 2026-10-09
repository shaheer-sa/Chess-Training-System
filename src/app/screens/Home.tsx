import React, { useState, useEffect } from 'react';
import { ScreenName } from '../App.js';
import { EngineClient } from '../engine/EngineClient.js';
import { Board } from '../components/Board.js';
import { MoveClassification } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { explain } from '../explain/explain.js';
import { LabelIcon } from '../components/LabelIcon.js';

interface HomeProps {
  onNavigate: (screen: ScreenName, fen?: string) => void;
  engineClient?: EngineClient;
}

const squareIndex = (sq: string): number => (sq.charCodeAt(1) - 49) * 8 + (sq.charCodeAt(0) - 97);

const HERO_FEN = 'k5br/p3Np1p/P4P1P/8/8/8/8/7K w - - 0 1';

export const Home: React.FC<HomeProps> = ({ onNavigate, engineClient }) => {
  const [moves, setMoves] = useState<MoveClassification[]>([]);
  const [heroPos] = useState(() => {
    const s = fenOps.parseFen(HERO_FEN);
    return s.isOk ? Chess.fromSetup(s.unwrap()).unwrap() : null;
  });

  useEffect(() => {
    if (engineClient) {
      engineClient.classifyMovesFrom(HERO_FEN, 'e7').then(res => {
        if (res.ok) setMoves(res.value);
      }).catch(() => {});
    }
  }, [engineClient]);


  return (
    <div style={{ padding: '40px 24px', maxWidth: '1320px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px' }}>
      
      {/* Hero Section */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 400px' }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', textTransform: 'uppercase', color: 'var(--accent-text)', fontWeight: 600, marginBottom: '16px' }}>
            PLAY. ANALYZE. IMPROVE.
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1.1, marginBottom: '24px' }}>
            See what happens before you move.
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-2)', marginBottom: '32px', maxWidth: '540px' }}>
            Pick a piece and every square it can reach is checked: who attacks it, who can really take back, and what the exchange costs you.
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => onNavigate('analysis')}
              style={{ background: 'var(--accent-btn)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
            >
              Analyze a position
            </button>
            <button 
              onClick={() => onNavigate('play')}
              style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '12px 24px', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
            >
              Play a game
            </button>
          </div>
        </div>

        <div style={{ flex: '1 1 400px', maxWidth: '480px' }}>
          {heroPos && (
            <div style={{ background: 'var(--panel)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div aria-hidden="true">
                <Board 
                position={heroPos}
                flipped={false}
                selectedSquare={52}
                destinationSquare={null}
                selectedDestInfo={null}
                moves={moves}
                expandedLevel={1}
                exchangeStep={0}
                readOnly={true}
                showBadgesOnReadOnly={true}
              />
              </div>
              {moves.length > 0 && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {['safe', 'even_trade', 'loses_material', 'unclear'].map(label => {
                    const mInfo = [...moves].sort((a, b) => squareIndex(a.move.to) - squareIndex(b.move.to)).find(m => m.label === label);
                    if (!mInfo) return null;
                    const explanation = explain(mInfo);
                    return (
                      <div key={label} style={{ padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: '6px', border: '1px solid var(--border-strong)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0, background: BADGE_INFO[label as keyof typeof BADGE_INFO].color, color: BADGE_INFO[label as keyof typeof BADGE_INFO].textColor, padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                          <LabelIcon kind={label as 'safe'|'even_trade'|'loses_material'|'unclear'} size={14} />
                          <span>{mInfo.move.to}</span> <span>&middot;</span> <span>{BADGE_INFO[label as keyof typeof BADGE_INFO].text}</span>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.4, paddingTop: '2px' }}>
                          {explanation.primary}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Mode Cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        <a 
          href="/" onClick={(e) => { e.preventDefault(); onNavigate('analysis'); }}
          style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-strong)', textDecoration: 'none', display: 'block' }}
        >
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', marginBottom: '8px' }}>Analyze a position</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Set up any board state and see the material consequences of every move.</p>
        </a>
        <a 
          href="/" onClick={(e) => { e.preventDefault(); onNavigate('play'); }}
          style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-strong)', textDecoration: 'none', display: 'block', minHeight: '44px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', margin: 0 }}>Play</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Play chess against a friend on one device. See material consequences as you play.</p>
        </a>
        <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', margin: 0 }}>Review a game</h2>
            <span style={{ fontSize: '0.75rem', background: 'var(--bg-sunken)', color: 'var(--text-faint)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-strong)' }}>Coming soon</span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Import a PGN and spot missed tactics instantly.</p>
        </div>
      </section>

      

    </div>
  );
};
