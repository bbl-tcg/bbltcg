import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Cap (Assistant Coach, YOUR_TURN): "Choose 2 non-STAR players on your field and
// swap their Health until your opponent's next End Phase."
function nonStarSlots(ctx) {
  return ctx.player().playerSlots.filter((s) => s && !s.isStarPlayer);
}

registerEffect("001-064", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return nonStarSlots(ctx).length >= 2;
  },
  *resolve(ctx) {
    const options = nonStarSlots(ctx).map((s) => s.instanceId);
    const [firstId, secondId] = yield { type: "CHOOSE_TWO_OWN_PLAYERS", prompt: "Swap the Health of which 2 non-Star players?", options };
    const a = ctx.findInstance(firstId).instance;
    const b = ctx.findInstance(secondId).instance;
    const healthA = a.currentHealth;
    const healthB = b.currentHealth;
    // Played on my own turn, so "your opponent's next End Phase" is the very next turn.
    const expires = { endOfTurn: ctx.state.turnNumber + 1 };
    a.currentHealth = healthB;
    b.currentHealth = healthA;
    ctx.addBuff(firstId, { source: "001-064", healthReversion: healthA, expires });
    ctx.addBuff(secondId, { source: "001-064", healthReversion: healthB, expires });
  },
});
