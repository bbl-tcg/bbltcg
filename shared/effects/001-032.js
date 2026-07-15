import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach April 49 (Assistant Coach): "Discard 1 card from your hand. Set 1 rested
// PLAYERSCORE UP! to the active position."
registerEffect("001-032", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().hand.length > 0 && ctx.player().psField.some((p) => !p.isActive);
  },
  *resolve(ctx) {
    const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Discard which card from your hand?", options };
    ctx.discardFromHandById(ctx.self, chosen.cardId);
    ctx.activateRestedPsUp(ctx.self, 1);
  },
});
