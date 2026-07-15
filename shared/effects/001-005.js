import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Nerf Miner (Player, ON_PLAY): "Choose 1 Skuba Doo player already on your field. The
// chosen player gains +1 Health until your opponent's next End Phase."
registerEffect("001-005", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && ctx.card(s.cardId).name === "Skuba Doo");
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s && ctx.card(s.cardId).name === "Skuba Doo").map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Give +1 Health to which Skuba Doo?", options };
    ctx.healCurrent(targetInstanceId, 1);
  },
});
