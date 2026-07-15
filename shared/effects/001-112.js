import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Viktor Krill Will Never Play on August Again!!! (Event, YOUR_TURN): "Choose one of the
// players on your field. Until your opponent's next End Phase, this player's base
// Attack and Health values are switched."
registerEffect("001-112", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Switch Attack and Health on which player?", options };
    const found = ctx.findInstance(targetInstanceId);
    if (!found) return;
    const inst = found.instance;
    const card = ctx.card(inst.cardId);
    const expires = { endOfTurn: ctx.state.turnNumber + 1 };
    ctx.addBuff(targetInstanceId, { source: "001-112", attack: card.health - card.attack, expires });
    const previousHealth = inst.currentHealth;
    inst.currentHealth = card.attack;
    ctx.addBuff(targetInstanceId, { source: "001-112", healthReversion: previousHealth, expires });
  },
});
