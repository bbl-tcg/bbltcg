import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Medusa (Player, WHILE_ATTACKING): "You may discard up to 3 cards from your hand. For
// each card you discard, your opponent must discard the same number of cards from their
// hand."
registerEffect("001-013", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return ctx.player().hand.length > 0;
  },
  *resolve(ctx) {
    const maxCount = Math.min(3, ctx.player().hand.length);
    const chosen = yield {
      type: "CHOOSE_CARDS",
      prompt: `Discard up to ${maxCount} cards from your hand`,
      zone: "hand",
      playerIndex: ctx.self,
      min: 0,
      max: maxCount,
    };
    const cardIds = chosen || [];
    for (const cardId of cardIds) ctx.discardFromHandById(ctx.self, cardId);

    if (cardIds.length > 0 && ctx.player(ctx.opponent).hand.length > 0) {
      const oppMax = Math.min(cardIds.length, ctx.player(ctx.opponent).hand.length);
      const oppChosen = yield {
        type: "CHOOSE_CARDS",
        forPlayer: ctx.opponent,
        prompt: `Discard ${oppMax} card(s) from your hand`,
        zone: "hand",
        playerIndex: ctx.opponent,
        min: oppMax,
        max: oppMax,
      };
      for (const cardId of oppChosen || []) ctx.discardFromHandById(ctx.opponent, cardId);
    }
  },
});
