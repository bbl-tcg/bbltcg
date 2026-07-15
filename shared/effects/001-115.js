import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Goodbye, R1P1... (Event, YOUR_TURN): "Discard all the cards in your hand, then draw 3
// cards from your deck." (Also part of Hal Lewis's win condition - see 001-086.js.)
registerEffect("001-115", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate() {
    return true;
  },
  *resolve(ctx) {
    const hand = [...ctx.player().hand];
    for (const cardId of hand) ctx.discardFromHandById(ctx.self, cardId);
    ctx.draw(ctx.self, 3);
  },
});
