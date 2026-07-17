import { findInstance } from "/shared/engine/state.js";
import { effectiveHealth, effectiveMaxHealth } from "/shared/engine/stats.js";
import { pendingAttackDamage } from "/shared/engine/combat.js";

// Effects yield bare instanceId strings for these choice types - the engine doesn't need
// anything more, but showing "inst_4" as a button label is useless to a real player.
const INSTANCE_ARRAY_TYPES = new Set(["CHOOSE_OWN_PLAYER", "CHOOSE_OPPONENT_PLAYER", "CHOOSE_TWO_OWN_PLAYERS", "CHOOSE_OPPONENT_PLAYERS"]);

/**
 * Enriches a choice request's options into `{ __enrichedInstance, instanceId, cardId,
 * threatened, currentHealth, maxHealth }` right before it's handed to showChoice(), so
 * choiceModal.js can render the actual card art (and, for single-card picks, a zoom-in
 * "Select" flow) instead of a raw instance id. The resolved answer still comes back as the
 * plain instanceId string - see choiceModal.js's normalizeCardOptions for the other half of
 * this.
 *
 * `threatened` marks whichever option is the attack's *current* target (per
 * `request.__windowCtx`, tagged on by engine.js's scopedResolver) - e.g. when Rebound/Save
 * ask "give +Health to which player?" mid-attack, the player actually under threat gets a
 * red glow so that's an informed choice rather than a guess. `pendingDamage` (top-level on
 * the request, not per-option) is the damage that attack would currently deal, so the player
 * can weigh it against each candidate's health right there in the prompt.
 */
export function enrichChoiceRequest(state, request) {
  if (!INSTANCE_ARRAY_TYPES.has(request.type) || !Array.isArray(request.options)) return request;
  const threatenedInstanceId = getThreatenedInstanceId(state, request.__windowCtx);
  const pendingDamage = pendingAttackDamage(state, request.__windowCtx);
  const options = request.options.map((instanceId) => {
    const found = findInstance(state, instanceId);
    if (!found) return instanceId;
    return {
      __enrichedInstance: true,
      instanceId,
      cardId: found.instance.cardId,
      threatened: instanceId === threatenedInstanceId,
      currentHealth: effectiveHealth(found.instance),
      maxHealth: effectiveMaxHealth(state, found.playerIndex, found.instance),
    };
  });
  return { ...request, options, pendingDamage: pendingDamage ?? request.pendingDamage };
}

function getThreatenedInstanceId(state, windowCtx) {
  if (!windowCtx || windowCtx.targetPlayerIndex === undefined || windowCtx.targetSlot === undefined) return null;
  const targetPlayer = state.players[windowCtx.targetPlayerIndex];
  const inst = targetPlayer?.playerSlots[windowCtx.targetSlot];
  return inst ? inst.instanceId : null;
}
