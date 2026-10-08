import React from 'react';
import { ScreenName } from '../App.js';

interface LogoProps {
  onNavigate: (screen: ScreenName) => void;
}

export const Logo: React.FC<LogoProps> = ({ onNavigate }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate('home');
  };

  return (
    <a
      href="/"
      aria-label="Rookvex — home"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '44px',
        textDecoration: 'none',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        width="36"
        height="36"
        fill="var(--accent)"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <path d="M8 5h5v4h4.5V5h5v4H27V5h5v9H8z" />
        <path fillRule="evenodd" d="M8 16.5h24L20 37zM14.6 16.5L20 25.4l5.4-8.9z" />
      </svg>
      <span
        style={{
          fontFamily: 'Cinzel, serif',
          fontWeight: 700,
          fontSize: '1.2rem',
          letterSpacing: '0.14em',
          color: 'var(--text)',
          userSelect: 'none',
        }}
      >
        ROOKVEX
      </span>
    </a>
  );
};
