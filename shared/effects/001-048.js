import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach June Fanpage (Assistant Coach, ON_PLAY): "Your opponent must discard all cards
// in their hand, then draw 5 cards from the top of their deck."
registerEffect("001-048", {
  trigger: TRIGGER.ON_PLAY,
  canActivate() {
    return true;
  },
  *resolve(ctx) {
    const hand = [...ctx.player(ctx.opponent).hand];
    for (const cardId of hand) ctx.discardFromHandById(ctx.opponent, cardId);
    ctx.draw(ctx.opponent, 5);
  },
});
