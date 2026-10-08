import React from 'react';
import { MoveClassification } from '../../engine/types.js';
import { BADGE_INFO, formatPawns } from '../shared/badgeInfo.js';
import { explain } from '../explain/explain.js';

interface ResultPanelProps {
  selectedDestInfo: MoveClassification | null;
  expandedLevel: number;
  setExpandedLevel: (lvl: number) => void;
  exchangeStep: number;
  setExchangeStep: (step: number) => void;
  stepText: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  selectedDestInfo, expandedLevel, setExpandedLevel, exchangeStep, stepText
}) => {
  if (!selectedDestInfo) {
    return (
      <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', margin: '4px' }}>
        <div>Results appear here after you choose a destination.</div>
      </div>
    );
  }

  const explanation = explain(selectedDestInfo);
  const attackers = selectedDestInfo.destination?.geometricAttackers || [];
  const defenders = selectedDestInfo.destination?.geometricDefenders || [];

  return (
    <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', margin: '4px' }}>
      <div>
        <h2>{BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].text} <span style={{ fontSize: '24px' }}>{BADGE_INFO[selectedDestInfo.label as keyof typeof BADGE_INFO].icon}</span></h2>
        <p><strong>{explanation.primary}</strong></p>
        
        {expandedLevel >= 2 && (
          <div style={{ marginTop: '20px' }}>
            {explanation.details.map((d, i) => <p key={`detail-${i}`}>{d}</p>)}
            {explanation.notes.map((n, i) => <p key={`note-${i}`}><em>{n}</em></p>)}
            
            <div style={{ marginTop: '10px' }}>
              <strong>Attackers:</strong> {attackers.length === 0 ? 'None' : attackers.map((a, i) => `A${i+1} (${a.color} ${a.role} on ${a.square})`).join(', ')}
            </div>
            <div>
              <strong>Defenders:</strong> {defenders.length === 0 ? 'None' : defenders.map((d, i) => {
                let status = '';
                if (selectedDestInfo.reasons.some(r => r.code === 'PINNED_DEFENDER' && r.squares?.includes(d.square))) status = " (can't take back — pinned)";
                else if (selectedDestInfo.reasons.some(r => r.code === 'KING_CANNOT_RECAPTURE' && r.squares?.includes(d.square))) status = " (king can't take back)";
                else if (selectedDestInfo.reasons.some(r => r.code === 'DEFENDER_UNAVAILABLE' && r.squares?.includes(d.square))) status = " (can't take back)";
                return `D${i+1} (${d.color} ${d.role} on ${d.square})${status}`;
              }).join(', ')}
            </div>
          </div>
        )}
        
        {expandedLevel >= 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && (
          <div style={{ marginTop: '20px', padding: '10px', background: '#eef' }}>
            <strong>Exchange:</strong>
            {exchangeStep > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div>{stepText}</div>
                <div>Balance: {selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter === 0 ? '0' : (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter > 0 ? '+' : '') + (selectedDestInfo.exchange.bestLine[exchangeStep - 1].balanceAfter / 100)}</div>
              </div>
            )}
          </div>
        )}

        {expandedLevel >= 4 && (
          <div style={{ marginTop: '20px', fontSize: '12px', background: '#333', color: '#fff', padding: '10px' }}>
            <strong>Advanced:</strong>
            <div>Net material: {formatPawns(selectedDestInfo.netMaterial)}</div>
            <div>Reasons: {selectedDestInfo.reasons.map(r => r.code).join(', ')}</div>
            {selectedDestInfo.exchange && (
              <>
                <div>Material from move: {formatPawns(selectedDestInfo.exchange.materialFromMove)}</div>
                <div>SEE: {formatPawns(selectedDestInfo.exchange.see)}</div>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {expandedLevel < 2 && <button onClick={() => setExpandedLevel(2)}>Show why</button>}
          {expandedLevel < 3 && selectedDestInfo.exchange && selectedDestInfo.exchange.bestLine.length > 0 && <button onClick={() => setExpandedLevel(3)}>Show the exchange</button>}
          {expandedLevel < 4 && <button onClick={() => setExpandedLevel(4)}>Advanced</button>}
        </div>
      </div>
    </div>
  );
};
