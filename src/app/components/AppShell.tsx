import React, { useState, useRef, useEffect } from 'react';
import { ScreenName } from '../App.js';
import { Logo } from './Logo.js';
import { SettingsPanel } from './SettingsPanel.js';
import { SiteSettings, readSettings, saveSettings, applySettings, SETTINGS_EVENT } from '../settings.js';

interface AppShellProps {
  children: React.ReactNode;
  onNavigate: (screen: ScreenName, fen?: string) => void;
  currentScreen: ScreenName;
  /** Where Back goes (the screen this one was opened from), shown as "Back to …". */
  backLabel?: string;
  onBack?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, onNavigate, currentScreen, backLabel, onBack }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(() => readSettings());
  const gearRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { applySettings(settings); }, [settings]);
  // Settings changed elsewhere (e.g. the evaluation bar toggle in Analyze): pick them up.
  useEffect(() => {
    const sync = () => {
      const latest = readSettings();
      setSettings(cur => (JSON.stringify(cur) === JSON.stringify(latest) ? cur : latest));
    };
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);
  const changeSettings = (s: SiteSettings) => { setSettings(s); saveSettings(s); };
  const closeSheet = React.useCallback(() => { setSheetOpen(false); gearRef.current?.focus(); }, []);
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
    { label: 'Play', screen: 'play' },
    { label: 'How labels work', screen: 'help' },
  ];

  const navItemStyle: React.CSSProperties = {
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontSize: '0.9rem',
    border: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        className="app-header"
        style={{
          background: 'var(--panel)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          className="app-header-inner"
          style={{
            maxWidth: '1320px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '60px',
            gap: '16px',
          }}
        >
          <Logo onNavigate={onNavigate} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Desktop nav */}
          <nav aria-label="Main navigation" style={{ display: 'flex', gap: '4px' }} className="desktop-nav">
            {navLinks.map(({ label, screen }) => (
              <a
                key={screen}
                href="/"
                className="rv-navlink"
                aria-current={currentScreen === screen ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(screen); }}
                style={navItemStyle}
              >
                {label}
              </a>
            ))}
          </nav>

          <button ref={gearRef} type="button" className="rv-icon-btn rv-gear" aria-label="Settings and about" aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
          {/* Mobile hamburger */}
          <button
            ref={menuBtnRef}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Menu"
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
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav
            id="mobile-menu"
            ref={menuRef}
            aria-label="Main navigation"
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
                className="rv-navlink"
                aria-current={currentScreen === screen ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(screen); setMenuOpen(false); }}
                style={{
                  ...navItemStyle,
                  display: 'flex',
                  width: '100%',
                  marginBottom: '4px',
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main style={{ flex: 1 }}>
        {backLabel && onBack && (
          <div className="rv-backbar">
            <button type="button" className="rv-back" onClick={onBack}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              Back to {backLabel}
            </button>
          </div>
        )}
        <div key={currentScreen} className="rv-fade-in-screen">
          {children}
        </div>
      </main>

      <SettingsPanel open={sheetOpen} onClose={closeSheet} settings={settings} onChange={changeSettings} />

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
