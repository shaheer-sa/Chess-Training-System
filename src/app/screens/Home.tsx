import React from 'react';
import { ScreenName } from '../App.js';

interface HomeProps {
  onNavigate: (screen: ScreenName) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <strong>Chess Training System</strong>
      </header>

      <h1>Chess Training System</h1>
      <p style={{ fontSize: '18px', color: '#555', marginBottom: '40px', textAlign: 'center', maxWidth: '500px' }}>
        Learn whether a move is safe, an even trade, or loses material.
      </p>

      <button 
        onClick={() => onNavigate('training')}
        style={{ padding: '16px 48px', fontSize: '18px', background: '#004d40', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '20px', width: '300px' }}
      >
        Train
      </button>

      <button 
        onClick={() => onNavigate('analysis')}
        style={{ padding: '16px 48px', fontSize: '18px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '20px', width: '300px' }}
      >
        Analyze a position
      </button>

      <button
        onClick={() => onNavigate('help')}
        style={{ padding: '0', fontSize: '16px', background: 'none', border: 'none', color: '#555', cursor: 'pointer', textDecoration: 'underline' }}
      >
        What do the labels mean?
      </button>
    </div>
  );
};
