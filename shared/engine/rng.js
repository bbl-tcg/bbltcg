// Small seedable PRNG (mulberry32) so games/tests can be deterministic when needed.
// Falls back to Math.random-derived seed if none given.

export function makeRng(seed) {
  let a = seed >>> 0 || (Math.random() * 0xffffffff) >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, rng) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function rollDie(rng, sides = 6) {
  return 1 + Math.floor(rng() * sides);
}

export function randomInt(rng, minInclusive, maxInclusive) {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function pickWeighted(rng, items) {
  // items: [{ value, weight }]
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let roll = rng() * total;
  for (const it of items) {
    if (roll < it.weight) return it.value;
    roll -= it.weight;
  }
  return items[items.length - 1].value;
}
