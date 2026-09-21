import type { Question } from './types.js';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

const TEXT_TEMPLATES = [
  'Standard practice applies; no exceptions noted for this engagement.',
  "Managed through the vendor's existing operational processes.",
  "Handled per the vendor's standard service agreement terms.",
];

const NAME_POOL = ['Jordan Lee', 'Morgan Reyes', 'Casey Kim', 'Taylor Brooks'];

export function generateAnswer(question: Question, { seed }: { seed?: number } = {}): string | number {
  const rand = seed !== undefined ? seededRandom(seed) : Math.random;
  const label = question.label.toLowerCase();

  if (question.type === 'radio' || question.type === 'select') {
    return pick(question.options!, rand);
  }

  if (question.type === 'number') {
    return Math.floor(rand() * 500) + 1;
  }

  if (question.type === 'date') {
    const daysAhead = Math.floor(rand() * 90) + 30;
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  if (label.includes('email')) {
    return 'contact@example.com';
  }

  if (label.includes('name') && !label.includes('vendor')) {
    return pick(NAME_POOL, rand);
  }

  return pick(TEXT_TEMPLATES, rand);
}
