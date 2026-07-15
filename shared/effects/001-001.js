import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Deck Sphera (Player): "If you have a Skuba Doo player in your hand, you may rest 1
// PLAYERSCORE UP! and add 1 Skuba Doo to your field."
registerEffect("001-001", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    const hand = ctx.player().hand;
    return (
      hand.some((cardId) => ctx.card(cardId).name === "Skuba Doo") &&
      ctx.canAfford(ctx.self, 1) &&
      ctx.findEmptySlot(ctx.self) !== -1
    );
  },
  *resolve(ctx) {
    ctx.payCost(ctx.self, 1);
    const hand = ctx.player().hand;
    const targetCardId = hand.find((cardId) => ctx.card(cardId).name === "Skuba Doo");
    const slot = ctx.findEmptySlot(ctx.self);
    ctx.playFreeToField(ctx.self, targetCardId, slot);
  },
});
