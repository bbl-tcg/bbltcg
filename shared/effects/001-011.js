import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Alexa (Player, ON_PLAY): "Discard this card from your field, and play a Tier 2 player
// from your hand in its place."
function tier2Options(ctx) {
  return ctx
    .player()
    .hand.map((cardId, handIndex) => ({ cardId, handIndex, card: ctx.card(cardId) }))
    .filter((e) => (e.card.type === "Player" || e.card.type === "StarPlayer") && e.card.tier === 2);
}

registerEffect("001-011", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return tier2Options(ctx).length > 0;
  },
  *resolve(ctx) {
    const options = tier2Options(ctx);
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Play which Tier 2 player in Alexa's place?", options };
    const slot = ctx.source.slot;
    ctx.discardFieldSlot(ctx.self, slot);
    ctx.playFreeToField(ctx.self, chosen.cardId, slot);
  },
});
