import React, { useEffect, useRef, useState } from 'react';
import { SiteSettings } from '../settings.js';
import { Segmented, Toggle } from './Controls.js';
import { Piece } from './Piece.js';
import { PIECE_SETS } from '../settings.js';

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
              <Toggle label="Sounds" hint="Sounds for moves, checks, the end of a game and special moves." checked={settings.sound} onChange={(v) => set({ sound: v })} />
              <Segmented label="Labels on the board" hint="Show labels on every square a piece can reach, or only on the square you point at (hover, focus or drag)."
                value={settings.labelMode} onChange={(v) => set({ labelMode: v })}
                options={[{ value: 'all', text: 'All squares', title: 'Labels on every square the piece can reach' }, { value: 'hover', text: 'Hovered square', title: 'A label only on the square you point at (hover, focus or drag)' }]} />
              <div className="rv-pieces">
                <span className="rv-toggle-label" id="rv-pieces-label">Pieces</span>
                <span className="rv-toggle-hint">The design of the chess pieces.</span>
                <div className="rv-pieces-grid" role="radiogroup" aria-labelledby="rv-pieces-label">
                  {PIECE_SETS.map(p => (
                    <button key={p.id} type="button" role="radio" aria-checked={settings.pieceSet === p.id} className="rv-pieces-opt" onClick={() => set({ pieceSet: p.id })}>
                      <span className="rv-pieces-preview" aria-hidden="true">
                        <Piece color="w" type="N" set={p.id} style={{ width: '50%', height: '100%' }} />
                        <Piece color="b" type="Q" set={p.id} style={{ width: '50%', height: '100%' }} />
                      </span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="rv-sheet-note">Settings are saved in this browser.</p>
            </div>
          )}
          {tab === 'about' && (
            <div className="rv-sheet-prose">
              <p>Rookvex helps you see what happens before you move. Pick a piece and every square it can reach is checked: who attacks it, who can really take back, and what the exchange costs you.</p>
              <h3>How it works</h3>
              <p><strong>Square check.</strong> For every square your piece can reach, Rookvex lists the attackers and defenders, plays out the best sequence of captures on that square and works out what you win or lose. Pins, defenders that can't take back and a king that can't recapture are taken into account. That gives the label: Safe, Even trade, Loses material or Unclear.</p>
              <p><strong>Engine check.</strong> A chess engine (Stockfish) also looks at the whole position once per turn, in Play and in Analyze a position. If a move looks fine on its square but loses elsewhere — a discovered attack, an open king, a mate threat — the label says so. If a move looks bad on its square but really wins, it becomes a Tactic. The engine never tells you the answer in advance.</p>
              <p><strong>Game review.</strong> In Analyze, a whole game (PGN) is reviewed move by move: each move gets a rating from Brilliant to Blunder, an explanation of what changed, and arrows for the better move and the opponent's reply. Finished reviews are kept in your browser, so a game opens instantly the next time.</p>
              <p><strong>Playing the computer.</strong> Six levels, from about 400 to about 2000 rating, measured by playing thousands of engine games. Lower levels make human-like mistakes on purpose; higher ones play stronger but limited moves.</p>
              <h3>Your data</h3>
              <p>Everything runs in your browser: the analysis, the engine and the computer opponent. Your settings, your current game and your game reviews are stored only in this browser. There is no account yet and nothing is sent to a server.</p>
              <h3>Built with</h3>
              <ul>
                <li>chessops — chess rules and move generation</li>
                <li>Stockfish 19 (Lite) — the engine check, the computer opponent and game review</li>
                <li>Lichess opening names (public domain) — opening moves in game review</li>
                <li>React and Vite</li>
              </ul>
              <p>Licence details are under License.</p>
            </div>
          )}
          {tab === 'history' && (
            <div className="rv-sheet-prose">
              <p><strong>Coming soon.</strong> With an account, every game you play here is saved with its date and result, and you can open any of them in Analyze.</p>
              <p>For now, when a game ends, use Analyze this game to review it.</p>
            </div>
          )}
          {tab === 'license' && <LicenseTab />}
        </div>
      </div>
    </div>
  );
};

/** License: the notice, the full GPL text and the third-party notices (the long texts load when the tab opens). */
const LicenseTab: React.FC = () => {
  const [texts, setTexts] = useState<{ gpl: string; notices: { title: string; text: string }[] } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([import('../../../LICENSE?raw'), import('../legal/notices.js')])
      .then(([gpl, n]) => { if (live) setTexts({ gpl: gpl.default, notices: n.NOTICES }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return (
    <div className="rv-sheet-prose">
      <p>Rookvex is free software, licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later). You may use, study, share and change it under that license.</p>
      <p>It includes chessops (GPL-3.0) and Stockfish (GPL-3.0). The complete source code is available on <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
      <p>This program comes with no warranty, to the extent permitted by law.</p>
      <h3>Third-party notices</h3>
      {texts ? texts.notices.map(n => (
        <details key={n.title} className="rv-legal">
          <summary>{n.title}</summary>
          <pre>{n.text}</pre>
        </details>
      )) : <p>Loading…</p>}
      <h3>GNU General Public License, version 3</h3>
      {texts ? <pre className="rv-legal-full" tabIndex={0} aria-label="GNU General Public License version 3, full text">{texts.gpl}</pre> : <p>Loading…</p>}
    </div>
  );
};
