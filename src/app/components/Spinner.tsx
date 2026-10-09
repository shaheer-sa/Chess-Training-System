import React from 'react';

export const Spinner: React.FC = () => {
  return (
    <svg 
      className="rv-spinner"
      aria-hidden="true" 
      width="16" height="16" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round"
    >
      <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3M18.364 5.636l-2.121 2.121M18.364 18.364l-2.121-2.121M5.636 18.364l2.121-2.121M5.636 5.636l2.121 2.121" />
    </svg>
  );
};
