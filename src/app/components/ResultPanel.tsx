import React from 'react';
import { MoveClassification } from '../../engine/types.js';
import { BADGE_INFO, formatPawns } from '../shared/badgeInfo.js';
import { explain } from '../explain/explain.js';
import { LabelIcon } from './LabelIcon.js';

interface ResultPanelProps {
  selectedDestInfo: MoveClassification | null;
  expandedLevel: number;
  setExpandedLevel: (lvl: number) => void;
  exchangeStep: number;
  setExchangeStep: (step: number) => void;
  stepText: string;
  /** Text for the empty state (default: before any destination is chosen). */
  emptyText?: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  selectedDestInfo, expandedLevel, setExpandedLevel, exchangeStep, stepText, emptyText
}) => {
  if (!selectedDestInfo) {
    return (
      <div style={{ flex: '1 1 300px', padding: '24px', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '28em', textAlign: 'center' }}>{emptyText ?? 'Results appear here after you choose a destination.'}</div>
      </div>
    );
  }

  const explanation = explain(selectedDestInfo);
  const attackers = selectedDestInfo.destination?.geometricAttackers || [];
  const defenders = selectedDestInfo.destination?.geometricDefenders || [];

  return (
    <div style={{ flex: '1 1 300px', padding: '24px', background: 'var(--panel)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].color, color: BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].textColor, padding: '8px 12px', borderRadius: '6px', fontWeight: 600, fontSize: '1.1rem', marginBottom: '16px' }}>
          <LabelIcon kind={selectedDestInfo.label as keyof typeof BADGE_INFO} size={20} />
          {BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].text}
        </div>
        <p style={{ fontSize: '1.1rem', color: 'var(--text)', lineHeight: 1.5, margin: '0 0 16px 0' }}><strong>{explanation.primary}</strong></p>
        
        {expandedLevel >= 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--bg-sunken)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            {explanation.details.map((d, i) => <p key={`detail-${i}`} style={{ margin: 0, color: 'var(--text-2)' }}>{d}</p>)}
            {explanation.notes.map((n, i) => <p key={`note-${i}`} style={{ margin: 0, color: 'var(--accent-text)', fontStyle: 'italic' }}>{n}</p>)}
            
            <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <div style={{ marginBottom: '4px' }}>
                <strong style={{ color: 'var(--text-2)' }}>Attackers:</strong> {attackers.length === 0 ? 'None' : attackers.map((a, i) => `A${i+1} (${a.color} ${a.role} on ${a.square})`).join(', ')}
              </div>
              <div>
                <strong style={{ color: 'var(--text-2)' }}>Defenders:</strong> {defenders.length === 0 ? 'None' : defenders.map((d, i) => {
                  let status = '';
                  if (selectedDestInfo.reasons.some(r => r.code === 'PINNED_DEFENDER' && r.squares?.includes(d.square))) status = " (can't take back — pinned)";
                  else if (selectedDestInfo.reasons.some(r => r.code === 'KING_CANNOT_RECAPTURE' && r.squares?.includes(d.square))) status = " (king can't take back)";
                  else if (selectedDestInfo.reasons.some(r => r.code === 'DEFENDER_UNAVAILABLE' && r.squares?.includes(d.square))) status = " (can't take back)";
                  return `D${i+1} (${d.color} ${d.role} on ${d.square})${status}`;
                }).join(', ')}
              </div>
            </div>
          </div>
        )}
        
        {expandedLevel >= 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-sunken)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--text-2)' }}>Exchange:</strong>
            {exchangeStep > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ color: 'var(--text)', marginBottom: '4px' }}>{stepText}</div>
                <div style={{ color: 'var(--text-muted)' }}>Balance: {selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter === 0 ? '0' : (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter > 0 ? '+' : '') + (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter / 100)}</div>
              </div>
            )}
          </div>
        )}

        {expandedLevel >= 4 && (
          <div style={{ marginTop: '16px', fontSize: '0.85rem', background: 'var(--board-ink)', color: 'var(--text-muted)', padding: '16px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'IBM Plex Mono, monospace' }}>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '8px' }}>Advanced Debug:</strong>
            <div style={{ marginBottom: '4px' }}>Net material: {formatPawns(selectedDestInfo.netMaterial)}</div>
            <div style={{ marginBottom: '4px' }}>Reasons: {selectedDestInfo.reasons.map(r => r.code).join(', ')}</div>
            {selectedDestInfo.exchange && (
              <>
                <div style={{ marginBottom: '4px' }}>Material from move: {formatPawns(selectedDestInfo.exchange.materialFromMove)}</div>
                <div>SEE: {formatPawns(selectedDestInfo.exchange.see)}</div>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {expandedLevel < 2 && (
            <button 
              onClick={() => setExpandedLevel(2)}
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
            >
              Show why
            </button>
          )}
          {expandedLevel < 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && (
            <button 
              onClick={() => setExpandedLevel(3)}
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
            >
              Show the exchange
            </button>
          )}
          {expandedLevel < 4 && (
            <button 
              onClick={() => setExpandedLevel(4)}
              style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '10px 16px', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
            >
              Advanced
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
