import React from 'react';

type IconKind = 'safe' | 'even_trade' | 'loses_material' | 'unclear' | 'tactic';

interface LabelIconProps {
  kind: IconKind;
  size?: number;
}

export const LabelIcon: React.FC<LabelIconProps> = ({ kind, size = 16 }) => {
  const shared = {
    width: size,
    height: size,
    display: 'inline-block',
    verticalAlign: 'middle',
    flexShrink: 0,
  } as const;

  if (kind === 'tactic') {
    return (
      <svg aria-hidden="true" data-icon="tactic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={shared} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5L3.5 9H8L7 14.5L12.5 7H8L9 1.5Z" />
      </svg>
    );
  }
  if (kind === 'safe') {
    return (
      <svg aria-hidden="true" data-icon="safe" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={shared} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="2.5 8.5 6 12 13.5 4" />
      </svg>
    );
  }
  if (kind === 'even_trade') {
    return (
      <svg aria-hidden="true" data-icon="even_trade" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={shared} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="10 3 13 6 10 9" />
        <line x1="3" y1="6" x2="13" y2="6" />
        <polyline points="6 7 3 10 6 13" />
        <line x1="3" y1="10" x2="13" y2="10" />
      </svg>
    );
  }
  if (kind === 'loses_material') {
    return (
      <svg aria-hidden="true" data-icon="loses_material" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={shared} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2L14.5 13.5H1.5L8 2Z" />
        <line x1="8" y1="6.5" x2="8" y2="10" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // unclear
  return (
    <svg aria-hidden="true" data-icon="unclear" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={shared} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5.5c0-1.1.9-2 2-2s2 .9 2 2c0 1.2-2 2.5-2 3.5" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
};
