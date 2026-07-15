import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Schmaxel (Head Coach): "If you have a Banned on your field, discard it and move 1
// PLAYERSCORE UP! from your PS Deck to your field. If there are no PLAYERSCORE UP! in your
// PS Deck, move one rested PLAYERSCORE UP! into the active position instead."
function findBannedSlot(ctx) {
  return ctx.player().playerSlots.findIndex((s) => s && ctx.card(s.cardId).name === "Banned");
}

registerEffect("001-007", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return findBannedSlot(ctx) !== -1;
  },
  *resolve(ctx) {
    const slot = findBannedSlot(ctx);
    ctx.discardFieldSlot(ctx.self, slot);
    if (ctx.player().psDeckCount > 0) {
      ctx.addPsUpFromDeckToField(ctx.self, 1);
    } else {
      ctx.activateRestedPsUp(ctx.self, 1);
    }
  },
});
