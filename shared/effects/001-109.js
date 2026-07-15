import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Winning Record and STILL Miss Playoffs??? (Event, YOUR_TURN): "If a STAR Player on
// your field is Tier 2, draw 1 card from your deck."
registerEffect("001-109", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && s.isStarPlayer && ctx.card(s.cardId).tier === 2) && ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 1);
  },
});
