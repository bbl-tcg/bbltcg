import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Ale (Head Coach, YOUR_TURN): "Choose 2 non-STAR players on your field and swap
// their Attack until your End Phase."
function nonStarSlots(ctx) {
  return ctx.player().playerSlots.filter((s) => s && !s.isStarPlayer);
}

registerEffect("001-063", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return nonStarSlots(ctx).length >= 2;
  },
  *resolve(ctx) {
    const options = nonStarSlots(ctx).map((s) => s.instanceId);
    const [firstId, secondId] = yield { type: "CHOOSE_TWO_OWN_PLAYERS", prompt: "Swap the Attack of which 2 non-Star players?", options };
    const a = ctx.findInstance(firstId).instance;
    const b = ctx.findInstance(secondId).instance;
    const baseA = ctx.card(a.cardId).attack;
    const baseB = ctx.card(b.cardId).attack;
    ctx.addBuff(firstId, { source: "001-063", attack: baseB - baseA, expires: { endOfTurn: ctx.state.turnNumber } });
    ctx.addBuff(secondId, { source: "001-063", attack: baseA - baseB, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
