export function shuffle<T>(items: readonly T[], rng = Math.random): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}

export function pickN<T>(items: readonly T[], n: number, rng = Math.random): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, n));
}
