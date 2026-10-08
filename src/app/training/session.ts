import { Exercise } from './exercises.js';

export function buildSession(exercises: Exercise[], rng: () => number = Math.random): Exercise[] {
  const d1 = exercises.filter(e => e.difficulty === 1);
  const d2 = exercises.filter(e => e.difficulty === 2);
  const d3 = exercises.filter(e => e.difficulty === 3);

  const shuffle = (array: Exercise[]) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const selectedD1 = shuffle(d1).slice(0, 4);
  const selectedD2 = shuffle(d2).slice(0, 3);
  const selectedD3 = shuffle(d3).slice(0, 3);

  return [...selectedD1, ...selectedD2, ...selectedD3];
}
