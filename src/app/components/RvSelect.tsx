import React, { useEffect, useId, useRef, useState } from 'react';

export interface RvOption<T extends string> {
  value: T;
  title: string;
  hint?: string;
  badge?: string;
}

interface RvSelectProps<T extends string> {
  label: string;
  value: T;
  options: RvOption<T>[];
  onChange: (value: T) => void;
}

const CLOSE_MS = 140;

/**
 * A select with an animated list (listbox pattern): button + popup list, full keyboard support
 * (arrows, Home/End, Enter/Space, Escape, Tab), closes on outside click.
 */
export function RvSelect<T extends string>({ label, value, options, onChange }: RvSelectProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [active, setActive] = useState(() => Math.max(0, options.findIndex(o => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeTimer = useRef<number | null>(null);
  const current = options.find(o => o.value === value) ?? options[0];
  const open = phase === 'open';

  const openList = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setPhase('open');
  };
  const closeList = (focusButton: boolean) => {
    setPhase(p => (p === 'closed' ? p : 'closing'));
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPhase('closed'), CLOSE_MS);
    if (focusButton) buttonRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    closeList(true);
  };

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  useEffect(() => { if (open) listRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeList(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); closeList(true); }
    else if (e.key === 'Tab') { closeList(false); }
  };

  return (
    <div className="rv-dd" ref={rootRef}>
      <span id={labelId} className="rv-dd-label">{label}</span>
      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        className="rv-dd-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={phase !== 'closed' ? listId : undefined}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={onButtonKey}
      >
        <span className="rv-dd-value">{current.title}</span>
        {current.badge && <span className="rv-soon">{current.badge}</span>}
        <svg className="rv-dd-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {phase !== 'closed' && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${id}-opt-${active}`}
          className={`rv-dd-list ${phase === 'closing' ? 'rv-dd-list--closing' : ''}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`rv-dd-option${i === active ? ' rv-dd-option--active' : ''}`}
              style={{ ['--i' as string]: i }}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="rv-dd-option-title">
                {o.title}
                {o.badge && <span className="rv-soon">{o.badge}</span>}
              </span>
              {o.hint && <span className="rv-dd-option-hint">{o.hint}</span>}
              {o.value === value && (
                <svg className="rv-dd-check" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-11" /></svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
