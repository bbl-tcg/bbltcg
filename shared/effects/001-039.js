import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { chooseOpponentPlayerTarget } from "./_helpers.js";

// Coach BetaBros (Head Coach): "If you have played an event during this turn, your
// opponent must discard a player from their field."
registerEffect("001-039", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.state.turnFlags.eventsPlayedThisTurnBy.includes(ctx.self) && ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const eligible = ctx.player(ctx.opponent).playerSlots.filter((s) => s);
    const targetInstanceId = yield* chooseOpponentPlayerTarget(ctx, { prompt: "Discard which of your players?", eligible });
    const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
    if (slot !== -1) ctx.discardFieldSlot(ctx.opponent, slot);
  },
});
