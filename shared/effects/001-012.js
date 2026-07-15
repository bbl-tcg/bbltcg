import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Matt Stats (Player, WHILE_ATTACKING): "Your opponent discards 1 card from the top of
// their deck."
registerEffect("001-012", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return ctx.player(ctx.opponent).deck.length > 0;
  },
  *resolve(ctx) {
    ctx.millToDiscard(ctx.opponent, 1);
  },
});
