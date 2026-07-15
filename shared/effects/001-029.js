import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Santiago Rivera (Player, OPPONENTS_TURN): "If a STAR Player on your field is being
// attacked by an opponent's player, negate the attack completely (including effects). If
// you activate this effect, discard this card and 1 card from your hand."
registerEffect("001-029", {
  trigger: TRIGGER.OPPONENTS_TURN,
  canActivate(ctx, windowCtx) {
    if (!windowCtx || windowCtx.targetPlayerIndex !== ctx.self) return false;
    const target = ctx.player().playerSlots[windowCtx.targetSlot];
    if (!target || !target.isStarPlayer) return false;
    return ctx.player().hand.length > 0;
  },
  *resolve(ctx, windowCtx) {
    windowCtx.cancelled = true;
    ctx.discardFieldSlot(ctx.self, ctx.source.slot);
    const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Discard which card from your hand?", options };
    ctx.discardFromHandById(ctx.self, chosen.cardId);
  },
});
