import React from 'react';
import { ScreenName } from '../App.js';

interface HomeProps {
  onNavigate: (screen: ScreenName) => void;
  onAnalyze: (fen: string) => void;
}

const SAMPLES = [
  { name: 'Trading queens', fen: 'k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1' },
  { name: 'Knight outpost', fen: '7k/8/8/3n4/4P3/8/5P2/6K1 w - - 0 1' },
  { name: 'Pawn break', fen: '4k3/8/8/8/3p4/8/2P5/4K3 w - - 0 1' }
];

export const Home: React.FC<HomeProps> = ({ onNavigate, onAnalyze }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <h1>Check Your Chess Moves</h1>
      <p style={{ fontSize: '18px', color: '#555', marginBottom: '30px' }}>
        Tap any move to see if it’s safe, an even trade, or loses material.
      </p>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        <button 
          onClick={() => onNavigate('analysis')}
          style={{ padding: '12px 24px', fontSize: '16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Analyze a position
        </button>
        <button 
          onClick={() => onNavigate('help')}
          style={{ padding: '12px 24px', fontSize: '16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          How to use
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: '600px' }}>
        <h2>Sample Positions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {SAMPLES.map((s, i) => (
            <button 
              key={i}
              onClick={() => onAnalyze(s.fen)}
              style={{ padding: '15px', textAlign: 'left', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
