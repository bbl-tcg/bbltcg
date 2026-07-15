/**
 * Drives an effect's generator to completion. `resolver(choiceRequest)` answers any
 * `yield` the effect makes (a player decision) — it may return a plain value or a
 * Promise, so the same runner works for a synchronous bot/test resolver and an
 * async one that waits on real UI/network input.
 */
export async function runEffect(generator, resolver) {
  let result = generator.next();
  while (!result.done) {
    const answer = await resolver(result.value);
    result = generator.next(answer);
  }
  return result.value;
}

/** Synchronous variant for headless tests/bot code where the resolver never needs to await. */
export function runEffectSync(generator, resolver) {
  let result = generator.next();
  while (!result.done) {
    const answer = resolver(result.value);
    result = generator.next(answer);
  }
  return result.value;
}
