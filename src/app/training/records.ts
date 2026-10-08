const STORAGE_KEY = 'cts.training.v1';

export interface TrainingRecord {
  sessionId: string;
  exerciseId: string;
  attempt: number;
  answer: 'safe' | 'even_trade' | 'loses_material' | 'unclear' | 'not_sure';
  confidence: 'low' | 'medium' | 'high' | null;
  correctLabel: string;
  correct: boolean | null;
  msToAnswer: number;
  timestamp: string;
}

function readRecords(): TrainingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeRecords(records: TrainingRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable — silently degrade
  }
}

export function appendRecord(record: TrainingRecord): void {
  const existing = readRecords();
  existing.push(record);
  writeRecords(existing);
}

export function getAllRecords(): TrainingRecord[] {
  return readRecords();
}

export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
