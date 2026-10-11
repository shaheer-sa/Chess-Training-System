import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/** A switch with a label and a short hint (keyboard: Space toggles; screen readers hear "switch, on/off"). */
export const Toggle: React.FC<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
  <label className="rv-toggle">
    <span className="rv-toggle-text">
      <span className="rv-toggle-label">{label}</span>
      <span className="rv-toggle-hint">{hint}</span>
    </span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="rv-toggle-track" aria-hidden="true"><span className="rv-toggle-thumb" /></span>
  </label>
);

/** Two or three choices side by side (a radio group); the selected one slides into place. */
export function Segmented<T extends string>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: { value: T; text: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  const index = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div className="rv-seg-wrap">
      <span id={`${id}-l`} className="rv-toggle-label">{label}</span>
      {hint && <span className="rv-toggle-hint">{hint}</span>}
      <div className="rv-seg" role="radiogroup" aria-labelledby={`${id}-l`} style={{ ['--n' as string]: options.length, ['--i' as string]: index }}>
        <span className="rv-seg-thumb" aria-hidden="true" />
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="rv-seg-opt"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = options[(index + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
              (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[options.indexOf(next)])?.focus();
            }}
            tabIndex={o.value === value ? 0 : -1}>
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An "Options" button (sliders icon) that opens a small panel; closes on Escape or a click outside. */
export const OptionsMenu: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Keep the panel on screen (phones): shift it sideways if it would stick out.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    el.style.setProperty('--shift', '0px');
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const shift = r.right > vw - 8 ? vw - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
    el.style.setProperty('--shift', `${shift}px`);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="rv-opts" ref={root}>
      <button ref={button} type="button" className={`rv-btn rv-opts-btn${open ? ' rv-opts-btn--open' : ''}`} aria-expanded={open} aria-controls={`${id}-p`} onClick={() => setOpen(o => !o)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" />
        </svg>
        <span>{title}</span>
      </button>
      {open && (
        <div ref={panel} id={`${id}-p`} className="rv-opts-panel" role="group" aria-label={title}>
          {children}
        </div>
      )}
    </div>
  );
};
