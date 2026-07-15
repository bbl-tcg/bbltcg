import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Sainz (Player, WHILE_ATTACKING): "Your opponent may discard 2 cards from their hand.
// If they do, this attack does nothing."
registerEffect("001-042", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return ctx.player(ctx.opponent).hand.length >= 2;
  },
  *resolve(ctx, windowCtx) {
    const wantsTo = yield { type: "CHOOSE_YES_NO", forPlayer: ctx.opponent, prompt: "Discard 2 cards from your hand to negate this attack?" };
    if (!wantsTo) return;
    const chosen = yield {
      type: "CHOOSE_CARDS",
      forPlayer: ctx.opponent,
      prompt: "Discard 2 cards from your hand",
      min: 2,
      max: 2,
    };
    for (const cardId of chosen || []) ctx.discardFromHandById(ctx.opponent, cardId);
    windowCtx.cancelled = true;
  },
});
