import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Le Finn (Head Coach): "Draw 1 card from your deck."
registerEffect("001-015", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 1);
  },
});
