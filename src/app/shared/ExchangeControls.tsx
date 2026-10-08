import React from 'react';
import { MoveClassification } from '../../engine/types.js';

interface ExchangeControlsProps {
  expandedLevel: number;
  exchangeStep: number;
  setExchangeStep: (step: number) => void;
  selectedDestInfo: MoveClassification | null;
  nextLabel?: string;
  prevLabel?: string;
}

export const ExchangeControls: React.FC<ExchangeControlsProps> = ({ expandedLevel, exchangeStep, setExchangeStep, selectedDestInfo, nextLabel = 'Next', prevLabel = 'Prev' }) => {
  if (expandedLevel < 3 || !selectedDestInfo?.exchange || selectedDestInfo.exchange.bestLine.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      <button style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }} onClick={() => setExchangeStep(0)} disabled={exchangeStep === 0}>Back to position</button>
      <button style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }} onClick={() => setExchangeStep(Math.max(1, exchangeStep - 1))} disabled={exchangeStep <= 1}>{prevLabel}</button>
      <button style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }} onClick={() => setExchangeStep(Math.min(selectedDestInfo.exchange!.bestLine.length, exchangeStep + 1))} disabled={exchangeStep === selectedDestInfo.exchange!.bestLine.length}>{nextLabel}</button>
    </div>
  );
};
