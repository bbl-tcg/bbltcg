import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach LeMarch (Assistant Coach): "Draw 1 card."
registerEffect("001-024", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 1);
  },
});
