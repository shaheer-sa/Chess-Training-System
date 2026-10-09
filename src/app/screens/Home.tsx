import React, { useState, useEffect, useRef } from 'react';
import { ScreenName } from '../App.js';
import { EngineClient } from '../engine/EngineClient.js';
import { Board } from '../components/Board.js';
import { MoveClassification } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { Spinner } from '../components/Spinner.js';
import { explain } from '../explain/explain.js';
import { LabelIcon } from '../components/LabelIcon.js';

interface HomeProps {
  onNavigate: (screen: ScreenName, fen?: string) => void;
  engineClient?: EngineClient;
}

type DemoLabel = 'safe' | 'even_trade' | 'loses_material' | 'unclear';
const DEMO_LABELS: DemoLabel[] = ['safe', 'even_trade', 'loses_material', 'unclear'];

const squareIndex = (sq: string): number => (sq.charCodeAt(1) - 49) * 8 + (sq.charCodeAt(0) - 97);

const HERO_FEN = 'k5br/p3Np1p/P4P1P/8/8/8/8/7K w - - 0 1';
const HEADLINE = ['See what happens', 'before you move.'];

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Cursor-following light for the hero and the cards (CSS reads --mx / --my). */
const trackPointer = (e: React.MouseEvent<HTMLElement>) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
};

const CardIcon: React.FC<{ kind: 'play' | 'analyze' | 'labels' }> = ({ kind }) => (
  <svg aria-hidden="true" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'play' && (<>
      <path d="M10 26h12M12 26l1-6h6l1 6M13 20c-2-2-3-5-1-8 1-2 4-3 5-6 3 2 5 5 4 9-1 2-2 3-2 5" />
      <circle cx="16.5" cy="11" r="1" fill="currentColor" />
    </>)}
    {kind === 'analyze' && (<>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12h16M12 4v16" />
      <circle cx="21" cy="21" r="5" />
      <path d="M25 25l3.5 3.5" />
    </>)}
    {kind === 'labels' && (<>
      <path d="M5 9l4 4 7-8" />
      <path d="M5 21h7M9 17l3 4-3 4" />
      <path d="M19 6h8M19 13h8M19 20h8M19 27h5" />
    </>)}
  </svg>
);

export const Home: React.FC<HomeProps> = ({ onNavigate, engineClient }) => {
  const [moves, setMoves] = useState<MoveClassification[]>([]);
  const [heroPos] = useState(() => {
    const s = fenOps.parseFen(HERO_FEN);
    return s.isOk ? Chess.fromSetup(s.unwrap()).unwrap() : null;
  });
  const [active, setActive] = useState<DemoLabel>('safe');
  const [userPicked, setUserPicked] = useState(false);
  const [typed, setTyped] = useState(0);
  const motionOk = useRef(!reducedMotion());

  useEffect(() => {
    if (engineClient) {
      engineClient.classifyMovesFrom(HERO_FEN, 'e7').then(res => {
        if (res.ok) setMoves(res.value);
      }).catch(() => {});
    }
  }, [engineClient]);

  // One example move per label (the lowest square, so the demo is stable).
  const examples = DEMO_LABELS
    .map(label => ({ label, move: [...moves].sort((a, b) => squareIndex(a.move.to) - squareIndex(b.move.to)).find(m => m.label === label) }))
    .filter((e): e is { label: DemoLabel; move: MoveClassification } => !!e.move);
  const current = examples.find(e => e.label === active) ?? examples[0];
  const text = current ? explain(current.move).primary : '';

  // The readout types each explanation, then moves on to the next label until the visitor picks one.
  useEffect(() => {
    if (!text) return;
    if (!motionOk.current) { setTyped(text.length); return; }
    setTyped(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 2;
      setTyped(Math.min(n, text.length));
      if (n >= text.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [text]);

  useEffect(() => {
    if (userPicked || examples.length === 0 || !motionOk.current) return;
    const id = window.setTimeout(() => {
      const i = examples.findIndex(e => e.label === current?.label);
      setActive(examples[(i + 1) % examples.length].label);
    }, 4200);
    return () => window.clearTimeout(id);
  }, [current?.label, userPicked, examples.length]);

  let w = 0; // word counter for the headline reveal

  return (
    <div className="rv-home">
      <section className="rv-hero" onMouseMove={trackPointer}>
        <div className="rv-hero-bg" aria-hidden="true">
          <div className="rv-hero-floor" />
          <div className="rv-hero-glow" />
          <div className="rv-hero-grain" />
        </div>

        <div className="rv-hero-inner">
          <div className="rv-hero-copy">
            <div className="rv-hero-tagline rv-in" style={{ ['--d' as string]: '150ms' }}>PLAY. ANALYZE. IMPROVE.</div>
            <h1 className="rv-hero-title">
              {HEADLINE.map((line, li) => (
                <span key={li} className="rv-hero-line">
                  {line.split(' ').map((word, wi) => (
                    <span key={wi} className="rv-word-mask">
                      <span className="rv-word" style={{ ['--w' as string]: w++ }}>{word}</span>
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="rv-hero-sub rv-in" style={{ ['--d' as string]: '750ms' }}>
              Pick a piece and every square it can reach is checked: who attacks it, who can really take back, and what the exchange costs you.
            </p>
            <div className="rv-hero-actions rv-in" style={{ ['--d' as string]: '900ms' }}>
              <button className="rv-btn rv-btn--primary rv-btn--lg" onClick={() => onNavigate('analysis')}>Analyze your game</button>
              <button className="rv-btn rv-btn--ghost rv-btn--lg" onClick={() => onNavigate('play')}>Play a game</button>
            </div>
          </div>

          <div className="rv-hero-demo rv-in" style={{ ['--d' as string]: '450ms' }}>
            {heroPos && (
              <div className="rv-demo-card">
                <div className="rv-hero-board" aria-hidden="true">
                  <Board
                    position={heroPos}
                    flipped={false}
                    selectedSquare={52}
                    destinationSquare={current ? squareIndex(current.move.move.to) : null}
                    selectedDestInfo={null}
                    moves={moves}
                    expandedLevel={1}
                    exchangeStep={0}
                    readOnly={true}
                    showBadgesOnReadOnly={true}
                  />
                </div>
                {moves.length === 0 ? (
                  <div className="rv-demo-readout" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Spinner /> Checking squares…</span>
                  </div>
                ) : (
                  <>
                    <div className="rv-demo-chips" role="group" aria-label="Example labels">
                      {examples.map(e => {
                        const b = BADGE_INFO[e.label];
                        return (
                          <button
                            key={e.label}
                            type="button"
                            className="rv-demo-chip"
                            aria-pressed={current?.label === e.label}
                            onClick={() => { setUserPicked(true); setActive(e.label); }}
                            style={{ ['--chip' as string]: b.color, ['--chip-text' as string]: b.textColor }}
                          >
                            <LabelIcon kind={e.label} size={14} />
                            {b.text}
                          </button>
                        );
                      })}
                    </div>
                    {current && (
                      <div className="rv-demo-readout">
                        <span className="mono rv-demo-move">Knight to {current.move.move.to}</span>
                        <span className="sr-only">{text}</span>
                        <span aria-hidden="true">
                          {text.slice(0, typed)}
                          {typed < text.length && <span className="rv-caret" />}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rv-home-cards">
        <a className="rv-card rv-card--spot rv-in" style={{ ['--d' as string]: '1050ms' }} href="/" onMouseMove={trackPointer} onClick={(e) => { e.preventDefault(); onNavigate('play'); }}>
          <span className="rv-card-icon"><CardIcon kind="play" /></span>
          <h2>Play</h2>
          <p>Play a friend on one device, or the computer at six levels. Every move you consider is checked.</p>
        </a>
        <a className="rv-card rv-card--spot rv-in" style={{ ['--d' as string]: '1150ms' }} href="/" onMouseMove={trackPointer} onClick={(e) => { e.preventDefault(); onNavigate('analysis'); }}>
          <span className="rv-card-icon"><CardIcon kind="analyze" /></span>
          <h2>Analyze your game</h2>
          <p>Paste a whole game (PGN) or one position (FEN), step through it, and try your own moves.</p>
        </a>
        <a className="rv-card rv-card--spot rv-in" style={{ ['--d' as string]: '1250ms' }} href="/" onMouseMove={trackPointer} onClick={(e) => { e.preventDefault(); onNavigate('help'); }}>
          <span className="rv-card-icon"><CardIcon kind="labels" /></span>
          <h2>How labels work</h2>
          <p>Safe, Even trade, Loses material, Unclear and Tactic: what each one means and where it comes from.</p>
        </a>
      </section>
    </div>
  );
};
