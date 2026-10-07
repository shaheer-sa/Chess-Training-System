import React from 'react';
import { ScreenName } from '../App.js';
import { BADGE_INFO } from './AnalysisScreen.js';

export const Help: React.FC<{ onNavigate: (s: ScreenName) => void }> = ({ onNavigate }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <button 
        onClick={() => onNavigate('home')}
        style={{ alignSelf: 'flex-start', padding: '8px 16px', marginBottom: '20px', cursor: 'pointer' }}
      >
        &larr; Back to Home
      </button>

      <h1>How to use</h1>
      <p style={{ maxWidth: '600px', fontSize: '18px', color: '#555', lineHeight: '1.5' }}>
        This app helps you learn if a move is safe. Just tap one of your pieces, and we'll tell you the immediate material consequences of moving to any square.
      </p>

      <div style={{ maxWidth: '600px', width: '100%', marginTop: '30px' }}>
        <h2>Vocabulary</h2>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['safe'].color, color: '#fff', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['safe'].icon}
            </span>
            <div>
              <strong>Safe</strong>: No immediate danger.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['even_trade'].color, color: '#fff', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['even_trade'].icon}
            </span>
            <div>
              <strong>Even trade</strong>: You lose material, but win back equal value.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['loses_material'].color, color: '#fff', padding: '5px', borderRadius: '4px' }}>
              {BADGE_INFO['loses_material'].icon}
            </span>
            <div>
              <strong>Loses material</strong>: The opponent can win more material than they lose.
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px', backgroundColor: BADGE_INFO['unclear'].color, color: '#fff', padding: '5px', borderRadius: '4px' }}>
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
