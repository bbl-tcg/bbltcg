import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Agent P (Player, ON_PLAY): "Draw 1 card from your deck."
registerEffect("001-067", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 1);
  },
});
