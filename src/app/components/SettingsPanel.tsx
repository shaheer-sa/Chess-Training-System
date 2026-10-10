import React, { useEffect, useRef, useState } from 'react';
import { SiteSettings } from '../settings.js';

type Tab = 'settings' | 'about' | 'history' | 'license';
const TABS: { id: Tab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' },
  { id: 'history', label: 'Game history' },
  { id: 'license', label: 'License' },
];
const REPO = 'https://github.com/shaheer-sa/chess-training-system';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: SiteSettings;
  onChange: (s: SiteSettings) => void;
}

const Toggle: React.FC<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
  <label className="rv-toggle">
    <span className="rv-toggle-text">
      <span className="rv-toggle-label">{label}</span>
      <span className="rv-toggle-hint">{hint}</span>
    </span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="rv-toggle-track" aria-hidden="true"><span className="rv-toggle-thumb" /></span>
  </label>
);

/** Side panel opened from the header: site settings, about, game history, license. */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose, settings, onChange }) => {
  const [tab, setTab] = useState<Tab>('settings');
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep focus inside the panel while it is open.
      const f = panelRef.current.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]');
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // While it slides out, the panel is inert: no dialog semantics, no focusable controls.
  useEffect(() => { panelRef.current?.toggleAttribute('inert', !open); }, [open, mounted]);

  if (!mounted) return null;
  const set = (patch: Partial<SiteSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className={`rv-sheet ${open ? 'rv-sheet--open' : ''}`} aria-hidden={open ? undefined : true}>
      <div className="rv-sheet-backdrop" onClick={open ? onClose : undefined} aria-hidden="true" />
      <div ref={panelRef} className="rv-sheet-panel" role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-labelledby={open ? 'rv-sheet-title' : undefined}>
        <div className="rv-sheet-head">
          <h2 id="rv-sheet-title">Rookvex</h2>
          <button ref={closeRef} type="button" className="rv-icon-btn" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="rv-sheet-tabs" role="tablist" aria-label="Sections">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" id={`rv-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`rv-tabpanel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                const i = TABS.findIndex(x => x.id === tab);
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
                  setTab(n);
                  document.getElementById(`rv-tab-${n}`)?.focus();
                }
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div key={tab} className="rv-sheet-body rv-fade-in-panel" role="tabpanel" id={`rv-tabpanel-${tab}`} aria-labelledby={`rv-tab-${tab}`}>
          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Toggle label="Reduce animations" hint="No sliding or moving effects. Loading indicators and fades stay." checked={settings.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
              <Toggle label="Board coordinates" hint="Letters and numbers along the board edges." checked={settings.coordinates} onChange={(v) => set({ coordinates: v })} />
              <Toggle label="Loading screen" hint="Show the Rookvex mark when the site first opens." checked={settings.loadingScreen} onChange={(v) => set({ loadingScreen: v })} />
              <Toggle label="Evaluation bar" hint="Show the engine's evaluation beside the board in Analyze." checked={settings.evalBar} onChange={(v) => set({ evalBar: v })} />
              <p className="rv-sheet-note">Settings are saved in this browser.</p>
            </div>
          )}
          {tab === 'about' && (
            <div className="rv-sheet-prose">
              <p>Rookvex helps you see what happens before you move. Pick a piece and every square it can reach is checked: who attacks it, who can really take back, and what the exchange costs you.</p>
              <p>A chess engine (Stockfish) also checks every position while you play, so a move that loses material in a way the square check can't see is flagged too.</p>
              <h3>Built with</h3>
              <ul>
                <li>chessops — chess rules and move generation</li>
                <li>Stockfish 19 (Lite) — the engine check and the computer opponent</li>
                <li>React and Vite</li>
              </ul>
              <p><a href={REPO} target="_blank" rel="noopener noreferrer">Source code on GitHub</a></p>
            </div>
          )}
          {tab === 'history' && (
            <div className="rv-sheet-prose">
              <p><strong>Coming soon.</strong> With an account, every game you play here is saved with its date and result, and you can open any of them in Analyze.</p>
              <p>For now, when a game ends, use Analyze this game to review it.</p>
            </div>
          )}
          {tab === 'license' && (
            <div className="rv-sheet-prose">
              <p>Rookvex is free software, licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later). You may use, study, share and change it under that license.</p>
              <p>It includes chessops (GPL-3.0) and Stockfish (GPL-3.0). The complete source code is available on <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
              <p>This program comes with no warranty, to the extent permitted by law.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
