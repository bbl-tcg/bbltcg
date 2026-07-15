import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Argo Riggs (Player, YOUR_TURN): "Draw 1 card from the top of your discard pile."
// (Discard pile convention in this engine: most-recently-discarded card is the last
// array entry, i.e. "the top.")
registerEffect("001-076", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().discard.length > 0;
  },
  *resolve(ctx) {
    const player = ctx.player();
    const cardId = player.discard.pop();
    player.hand.push(cardId);
  },
});
