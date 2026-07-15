import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Harry (Assistant Coach, YOUR_TURN): "Discard 1 card from your hand."
registerEffect("001-096", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().hand.length > 0;
  },
  *resolve(ctx) {
    const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Discard which card from your hand?", options };
    ctx.discardFromHandById(ctx.self, chosen.cardId);
  },
});
