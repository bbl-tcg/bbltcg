import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Dwayne (Player, YOUR_TURN): "Set one of your rested PLAYERSCORE UP! to the active position."
registerEffect("001-018", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().psField.some((p) => !p.isActive);
  },
  *resolve(ctx) {
    ctx.activateRestedPsUp(ctx.self, 1);
  },
});
