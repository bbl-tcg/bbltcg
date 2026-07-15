import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Martin Samuel (Player, ON_PLAY): "Attach 1 active PLAYERSCORE UP! to a STAR Player on
// your field." (Explicit effect override letting PS UP attach to a Star Player.)
function activePsUpOptions(ctx) {
  return ctx.player().psField.filter((p) => p.isActive && !p.attachedTo);
}
function starPlayerOptions(ctx) {
  return ctx.player().playerSlots.filter((s) => s && s.isStarPlayer);
}

registerEffect("001-025", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return activePsUpOptions(ctx).length > 0 && starPlayerOptions(ctx).length > 0;
  },
  *resolve(ctx) {
    const psUpOptions = activePsUpOptions(ctx).map((p) => p.id);
    const psUpId = psUpOptions.length === 1 ? psUpOptions[0] : yield { type: "CHOOSE_PS_UP", prompt: "Attach which active PLAYERSCORE UP!?", options: psUpOptions };
    const starOptions = starPlayerOptions(ctx).map((s) => s.instanceId);
    const targetInstanceId = starOptions.length === 1 ? starOptions[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Attach it to which Star Player?", options: starOptions };
    ctx.attachPsUpForced(ctx.self, psUpId, targetInstanceId);
  },
});
