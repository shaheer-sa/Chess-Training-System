import React, { useState, useRef, useEffect } from 'react';
import { ScreenName } from '../App.js';
import { Logo } from './Logo.js';

interface AppShellProps {
  children: React.ReactNode;
  onNavigate: (screen: ScreenName) => void;
  currentScreen: ScreenName;
}

export const AppShell: React.FC<AppShellProps> = ({ children, onNavigate, currentScreen }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const navLinks: { label: string; screen: ScreenName }[] = [
    { label: 'Analyze', screen: 'analysis' },
    { label: 'Beginner drills', screen: 'training' },
    { label: 'How labels work', screen: 'help' },
  ];

  const navItemStyle = (screen: ScreenName): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 14px',
    borderRadius: '6px',
    background: currentScreen === screen ? 'var(--panel-hover)' : 'transparent',
    color: 'var(--text-2)',
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontSize: '0.9rem',
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--panel)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: '1320px',
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '60px',
            gap: '16px',
          }}
        >
          <Logo onNavigate={onNavigate} />

          {/* Desktop nav */}
          <nav aria-label="Main navigation" style={{ display: 'flex', gap: '4px' }} className="desktop-nav">
            {navLinks.map(({ label, screen }) => (
              <a
                key={screen}
                href="/"
                aria-current={currentScreen === screen ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(screen); }}
                style={navItemStyle(screen)}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            ref={menuBtnRef}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'none',
              width: '44px',
              height: '44px',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              borderRadius: '6px',
              cursor: 'pointer',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '10px',
              color: 'var(--text)',
            }}
            className="hamburger-btn"
          >
            <span style={{ display: 'block', width: '18px', height: '2px', background: 'var(--text)' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', background: 'var(--text)' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', background: 'var(--text)' }} />
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            id="mobile-menu"
            ref={menuRef}
            role="menu"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--panel)',
              padding: '8px 16px 16px',
            }}
          >
            {navLinks.map(({ label, screen }) => (
              <a
                key={screen}
                href="/"
                role="menuitem"
                aria-current={currentScreen === screen ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(screen); setMenuOpen(false); }}
                style={{
                  ...navItemStyle(screen),
                  display: 'flex',
                  width: '100%',
                  marginBottom: '4px',
                }}
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>
        {children}
      </main>

      <footer
        style={{
          background: 'var(--panel)',
          borderTop: '1px solid var(--border)',
          padding: '16px 24px',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}
      >
        <div
          style={{
            maxWidth: '1320px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>Rookvex · GPL-3.0-or-later · built on chessops</span>
          <a
            href="https://github.com/shaheer-sa/chess-training-system"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-text)' }}
          >
            Source on GitHub
          </a>
        </div>
      </footer>

      <style>{`
        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .hamburger-btn { display: flex !important; }
        }
        @media (min-width: 768px) {
          .hamburger-btn { display: none !important; }
          .desktop-nav { display: flex !important; }
        }
      `}</style>
    </div>
  );
};
