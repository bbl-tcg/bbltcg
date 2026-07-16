import { findInstance } from "/shared/engine/state.js";

// Effects yield bare instanceId strings for these choice types - the engine doesn't need
// anything more, but showing "inst_4" as a button label is useless to a real player.
const INSTANCE_ARRAY_TYPES = new Set(["CHOOSE_OWN_PLAYER", "CHOOSE_OPPONENT_PLAYER", "CHOOSE_TWO_OWN_PLAYERS", "CHOOSE_OPPONENT_PLAYERS"]);

/**
 * Enriches a choice request's options into `{ __enrichedInstance, instanceId, cardId }`
 * right before it's handed to showChoice(), so choiceModal.js can render the actual card
 * art (and, for single-card picks, a zoom-in "Select" flow) instead of a raw instance id.
 * The resolved answer still comes back as the plain instanceId string - see
 * choiceModal.js's normalizeCardOptions for the other half of this.
 */
export function enrichChoiceRequest(state, request) {
  if (!INSTANCE_ARRAY_TYPES.has(request.type) || !Array.isArray(request.options)) return request;
  const options = request.options.map((instanceId) => {
    const found = findInstance(state, instanceId);
    return found ? { __enrichedInstance: true, instanceId, cardId: found.instance.cardId } : instanceId;
  });
  return { ...request, options };
}
