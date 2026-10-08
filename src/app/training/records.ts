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

// In-memory fallback
let memoryRecords: TrainingRecord[] = [];
let hasLoadedFromStorage = false;

function loadFromStorage(): TrainingRecord[] {
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

function writeToStorage(records: TrainingRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable — silently degrade, records remain in memory
  }
}

function ensureLoaded() {
  if (!hasLoadedFromStorage) {
    const stored = loadFromStorage();
    // Merge any existing memory records not in storage
    const storedKeys = new Set(stored.map(r => `${r.sessionId}-${r.exerciseId}-${r.attempt}`));
    const toAdd = memoryRecords.filter(r => !storedKeys.has(`${r.sessionId}-${r.exerciseId}-${r.attempt}`));
    memoryRecords = [...stored, ...toAdd];
    hasLoadedFromStorage = true;
  }
}

export function appendRecord(record: TrainingRecord): void {
  ensureLoaded();
  // Prevent duplicate insertion
  const key = `${record.sessionId}-${record.exerciseId}-${record.attempt}`;
  if (memoryRecords.some(r => `${r.sessionId}-${r.exerciseId}-${r.attempt}` === key)) {
    return;
  }
  memoryRecords.push(record);
  writeToStorage(memoryRecords);
}

export function getAllRecords(): TrainingRecord[] {
  ensureLoaded();
  return [...memoryRecords];
}

export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// For testing
export function _resetRecordsState(): void {
  memoryRecords = [];
  hasLoadedFromStorage = false;
}
