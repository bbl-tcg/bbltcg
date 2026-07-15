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
