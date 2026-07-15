import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Rocky (Assistant Coach): "Draw 5 cards from your deck. Then, discard 3 cards
// from your hand."
registerEffect("001-016", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 5);
    const handSize = ctx.player().hand.length;
    const discardCount = Math.min(3, handSize);
    if (discardCount === 0) return;
    const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex, card: ctx.card(cardId) }));
    const chosen = yield {
      type: "CHOOSE_CARDS",
      prompt: `Discard ${discardCount} card(s) from your hand`,
      options,
      min: discardCount,
      max: discardCount,
    };
    for (const cardId of chosen || []) ctx.discardFromHandById(ctx.self, cardId);
  },
});
