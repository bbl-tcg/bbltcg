import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Snowball (Head Coach, YOUR_TURN): "Discard the top card from your deck."
registerEffect("001-095", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.millToDiscard(ctx.self, 1);
  },
});
