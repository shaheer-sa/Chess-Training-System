import { MoveClassification } from '../../engine/types.js';

export function getStepText(selectedDestInfo: MoveClassification | null, exchangeStep: number): string {
  if (!selectedDestInfo || !selectedDestInfo.exchange || exchangeStep <= 0) return '';
  const step = selectedDestInfo.exchange.bestLine[exchangeStep - 1];
  if (!step) return '';
  return `Step ${exchangeStep} of ${selectedDestInfo.exchange.bestLine.length}: ${step.side === 'white' ? 'White' : 'Black'} ${step.capturer.role} on ${step.capturer.square} takes ${step.captured.role} on ${step.captured.square}${step.promotion ? ' and becomes a queen' : ''}${step.givesCheck ? ' — check' : ''}.`;
}
