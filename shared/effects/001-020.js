import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Mr. Irrelevant (Player, YOUR_TURN): "Draw 1 card. You may discard 1 card from your
// hand, and if you do, set 1 of your rested PLAYERSCORE UP! into the active position."
registerEffect("001-020", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    ctx.draw(ctx.self, 1);
    const hand = ctx.player().hand;
    if (hand.length === 0 || !ctx.player().psField.some((p) => !p.isActive)) return;
    const options = hand.map((cardId, handIndex) => ({ cardId, handIndex }));
    const chosen = yield { type: "CHOOSE_HAND_CARD_OPTIONAL", prompt: "Discard 1 card to ready a rested PLAYERSCORE UP!?", options };
    if (!chosen) return;
    ctx.discardFromHandById(ctx.self, chosen.cardId);
    ctx.activateRestedPsUp(ctx.self, 1);
  },
});
