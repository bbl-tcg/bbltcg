import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// From 1-5 to Champions, We Are the Ghouls!!! (Event, YOUR_TURN): "Rest up to 2 active
// PLAYERSCORE UP! For each PLAYERSCORE UP! you rest, draw 1 card from the top of your
// Discard Pile."
registerEffect("001-114", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.canAfford(ctx.self, 1) && ctx.player().discard.length > 0;
  },
  *resolve(ctx) {
    const maxCount = Math.min(2, ctx.player().psField.filter((p) => p.isActive && !p.attachedTo).length, ctx.player().discard.length);
    const count = maxCount <= 1 ? maxCount : yield { type: "CHOOSE_NUMBER", prompt: `Rest how many PLAYERSCORE UP! (0-${maxCount})?`, min: 0, max: maxCount };
    if (!count) return;
    ctx.payCost(ctx.self, count);
    for (let i = 0; i < count; i++) {
      const player = ctx.player();
      if (player.discard.length === 0) break;
      player.hand.push(player.discard.pop());
    }
  },
});
