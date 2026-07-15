import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// TKO (Event, YOUR_TURN): "You may draw 1 card from your Score and discard a player from
// your field. If you do, choose 2 players from your opponent's field. The chosen players
// are discarded."
registerEffect("001-101", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().score.length > 0 && ctx.player().playerSlots.some((s) => s) && ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const ownOptions = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const ownTarget = ownOptions.length === 1 ? ownOptions[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Discard which player from your field?", options: ownOptions };
    ctx.drawFromScoreCard(ctx.self);
    const ownSlot = ctx.player().playerSlots.findIndex((s) => s && s.instanceId === ownTarget);
    if (ownSlot !== -1) ctx.discardFieldSlot(ctx.self, ownSlot);

    const oppEligible = ctx.player(ctx.opponent).playerSlots.filter((s) => s);
    const count = Math.min(2, oppEligible.length);
    if (count === 0) return;
    const options = oppEligible.map((s) => s.instanceId);
    const chosen = count === options.length ? options : yield { type: "CHOOSE_OPPONENT_PLAYERS", prompt: `Discard ${count} of your opponent's players`, options, count };
    for (const instanceId of chosen) {
      const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === instanceId);
      if (slot !== -1) ctx.discardFieldSlot(ctx.opponent, slot);
    }
  },
});
