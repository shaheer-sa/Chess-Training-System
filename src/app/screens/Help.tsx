import React from 'react';
import { ScreenName } from '../App.js';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { LabelIcon } from '../components/LabelIcon.js';

export const Help: React.FC<{ onNavigate: (s: ScreenName) => void }> = ({ onNavigate }) => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>What do the labels mean?</h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-2)', lineHeight: '1.5', maxWidth: '600px', margin: 0 }}>
          This app helps you learn if a move is safe. Just tap one of your pieces, and we'll tell you the immediate material consequences of moving to any square.
        </p>
      </div>

      <div style={{ background: 'var(--panel)', padding: '32px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', margin: 0 }}>Vocabulary</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'flex', backgroundColor: BADGE_INFO['safe'].color, color: BADGE_INFO['safe'].textColor, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)' }}>
              <LabelIcon kind="safe" size={24} />
            </span>
            <div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text)' }}>Safe</strong>
              <div style={{ color: 'var(--text-muted)' }}>No immediate danger.</div>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'flex', backgroundColor: BADGE_INFO['even_trade'].color, color: BADGE_INFO['even_trade'].textColor, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)' }}>
              <LabelIcon kind="even_trade" size={24} />
            </span>
            <div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text)' }}>Even trade</strong>
              <div style={{ color: 'var(--text-muted)' }}>You lose material, but win back equal value.</div>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'flex', backgroundColor: BADGE_INFO['loses_material'].color, color: BADGE_INFO['loses_material'].textColor, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)' }}>
              <LabelIcon kind="loses_material" size={24} />
            </span>
            <div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text)' }}>Loses material</strong>
              <div style={{ color: 'var(--text-muted)' }}>The opponent can win more material than they lose.</div>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'flex', backgroundColor: BADGE_INFO['unclear'].color, color: BADGE_INFO['unclear'].textColor, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)' }}>
              <LabelIcon kind="unclear" size={24} />
            </span>
            <div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text)' }}>Unclear</strong>
              <div style={{ color: 'var(--text-muted)' }}>The position is too complex for simple material counting.</div>
            </div>
          </li>
        </ul>
      </div>

      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button 
          onClick={() => onNavigate('home')}
          style={{ background: 'var(--accent-btn)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem' }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};
