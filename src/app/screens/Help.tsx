import React from 'react';
import { ScreenName } from '../App.js';
import { BADGE_INFO } from './AnalysisScreen.js';

export const Help: React.FC<{ onNavigate: (s: ScreenName) => void }> = ({ onNavigate }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <strong>Chess Training System</strong>
        <button onClick={() => onNavigate('home')}>Home</button>
      </header>

      <h1>What do the labels mean?</h1>
      <p style={{ maxWidth: '600px', fontSize: '18px', color: '#555', lineHeight: '1.5' }}>
        This app helps you learn if a move is safe. Just tap one of your pieces, and we'll tell you the immediate material consequences of moving to any square.
      </p>

      <div style={{ maxWidth: '600px', width: '100%', marginTop: '30px' }}>
        <h2>Vocabulary</h2>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['safe'].color, color: BADGE_INFO['safe'].textColor, border: '1px solid #000', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['safe'].icon}
            </span>
            <div>
              <strong>Safe</strong>: No immediate danger.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['even_trade'].color, color: BADGE_INFO['even_trade'].textColor, border: '1px solid #000', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['even_trade'].icon}
            </span>
            <div>
              <strong>Even trade</strong>: You lose material, but win back equal value.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['loses_material'].color, color: BADGE_INFO['loses_material'].textColor, border: '1px solid #000', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['loses_material'].icon}
            </span>
            <div>
              <strong>Loses material</strong>: The opponent can win more material than they lose.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['unclear'].color, color: BADGE_INFO['unclear'].textColor, border: '1px solid #000', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['unclear'].icon}
            </span>
            <div>
              <strong>Unclear</strong>: The position is too complex for simple material counting.
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
};
