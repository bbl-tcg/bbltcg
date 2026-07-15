// Plain storage module with no dependencies on the rest of the engine, so both
// stats.js (reads it) and effects/*.js (write to it) can import it without a cycle.

const registry = new Map(); // cardId -> EffectDef | { main: EffectDef, starPower: EffectDef }

/**
 * @typedef {Object} EffectDef
 * @property {string|null} trigger - one of TRIGGER.* or null for an always-on static effect
 * @property {(engine: import('./engine.js').Engine, ctx: object) => boolean} [canActivate]
 * @property {(engine: import('./engine.js').Engine, ctx: object) => Generator} [resolve] - generator, may `yield` a choice request
 * @property {object} [staticEffect] - hooks consulted by stats.js/rules when trigger is null
 */

export function registerEffect(cardId, def) {
  if (registry.has(cardId)) {
    throw new Error(`Duplicate effect registration for ${cardId}`);
  }
  registry.set(cardId, def);
}

export function registerStarPlayerEffect(cardId, mainDef, starPowerDef) {
  if (registry.has(cardId)) {
    throw new Error(`Duplicate effect registration for ${cardId}`);
  }
  registry.set(cardId, { main: mainDef, starPower: starPowerDef });
}

/**
 * The BBLTCG-001 set reprints ~40 cards as Alternative Art / Secret Rare variants of an
 * earlier Common/Rare printing, with byte-identical (or near-identical) rules text - same
 * name, same trigger, same effect. Register the earlier id's EffectDef once, then alias
 * every reprint id to it instead of copy-pasting a new file per variant.
 */
export function aliasEffect(newCardId, existingCardId) {
  const existing = registry.get(existingCardId);
  if (!existing) {
    throw new Error(`Cannot alias ${newCardId} -> ${existingCardId}: ${existingCardId} is not registered yet`);
  }
  if (registry.has(newCardId)) {
    throw new Error(`Duplicate effect registration for ${newCardId}`);
  }
  registry.set(newCardId, existing);
}

export function getEffect(cardId) {
  return registry.get(cardId) || null;
}

export function hasEffect(cardId) {
  return registry.has(cardId);
}

export function registeredCount() {
  return registry.size;
}

export function allRegisteredIds() {
  return [...registry.keys()];
}
