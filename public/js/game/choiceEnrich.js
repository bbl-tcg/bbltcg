import { findInstance } from "/shared/engine/state.js";

// Effects yield bare instanceId strings for these choice types - the engine doesn't need
// anything more, but showing "inst_4" as a button label is useless to a real player.
const INSTANCE_ARRAY_TYPES = new Set(["CHOOSE_OWN_PLAYER", "CHOOSE_OPPONENT_PLAYER", "CHOOSE_TWO_OWN_PLAYERS", "CHOOSE_OPPONENT_PLAYERS"]);

/**
 * Enriches a choice request's options into `{ __enrichedInstance, instanceId, cardId,
 * threatened }` right before it's handed to showChoice(), so choiceModal.js can render the
 * actual card art (and, for single-card picks, a zoom-in "Select" flow) instead of a raw
 * instance id. The resolved answer still comes back as the plain instanceId string - see
 * choiceModal.js's normalizeCardOptions for the other half of this.
 *
 * `threatened` marks whichever option is the attack's *current* target (per
 * `request.__windowCtx`, tagged on by engine.js's scopedResolver) - e.g. when Rebound/Save
 * ask "give +Health to which player?" mid-attack, the player actually under threat gets a
 * red glow so that's an informed choice rather than a guess.
 */
export function enrichChoiceRequest(state, request) {
  if (!INSTANCE_ARRAY_TYPES.has(request.type) || !Array.isArray(request.options)) return request;
  const threatenedInstanceId = getThreatenedInstanceId(state, request.__windowCtx);
  const options = request.options.map((instanceId) => {
    const found = findInstance(state, instanceId);
    if (!found) return instanceId;
    return { __enrichedInstance: true, instanceId, cardId: found.instance.cardId, threatened: instanceId === threatenedInstanceId };
  });
  return { ...request, options };
}

function getThreatenedInstanceId(state, windowCtx) {
  if (!windowCtx || windowCtx.targetPlayerIndex === undefined || windowCtx.targetSlot === undefined) return null;
  const targetPlayer = state.players[windowCtx.targetPlayerIndex];
  const inst = targetPlayer?.playerSlots[windowCtx.targetSlot];
  return inst ? inst.instanceId : null;
}
