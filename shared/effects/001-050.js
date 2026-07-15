import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Daisy Hart (Player, YOUR_TURN): "You may discard this card from your field. If you do,
// discard a Tier 2 player from your hand or field, and draw 1 card from your deck."
function tier2Candidates(ctx) {
  const fromHand = ctx
    .player()
    .hand.map((cardId, handIndex) => ({ zone: "hand", cardId, handIndex, card: ctx.card(cardId) }))
    .filter((e) => (e.card.type === "Player" || e.card.type === "StarPlayer") && e.card.tier === 2);
  const fromField = ctx
    .player()
    .playerSlots.map((s, slot) => ({ zone: "field", instance: s, slot }))
    .filter((e) => e.instance && e.instance.instanceId !== ctx.source.instanceId && ctx.card(e.instance.cardId).tier === 2);
  return { fromHand, fromField };
}

registerEffect("001-050", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    const { fromHand, fromField } = tier2Candidates(ctx);
    return fromHand.length + fromField.length > 0;
  },
  *resolve(ctx) {
    ctx.discardFieldSlot(ctx.self, ctx.source.slot);
    const { fromHand, fromField } = tier2Candidates(ctx);
    const options = [...fromHand.map((e) => ({ label: `hand:${e.cardId}`, ...e })), ...fromField.map((e) => ({ label: `field:${e.instance.instanceId}`, ...e }))];
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_TIER2_TO_DISCARD", prompt: "Discard a Tier 2 player from your hand or field", options };
    if (chosen.zone === "hand") {
      ctx.discardFromHandAt(ctx.self, chosen.handIndex);
    } else {
      ctx.discardFieldSlot(ctx.self, chosen.slot);
    }
    ctx.draw(ctx.self, 1);
  },
});
