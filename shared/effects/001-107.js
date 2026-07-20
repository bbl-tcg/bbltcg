import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Dwayne's Trade Value Skyrockets!!! (Event, ON_OPPONENTS_ATTACK): "Attach 1 active
// PLAYERSCORE UP! to a player on your field. That player gains +2 Health for each
// PLAYERSCORE UP! attached in this way."
function activePsUpOptions(ctx) {
  return ctx.player().psField.filter((p) => p.isActive && !p.attachedTo);
}

registerEffect("001-107", {
  trigger: TRIGGER.ON_OPPONENTS_ATTACK,
  canActivate(ctx) {
    return activePsUpOptions(ctx).length > 0 && ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    // Paying this Event's own cost may have rested the only active PS UP that was
    // available when canActivate ran (cost payment happens before resolve()) - re-check
    // rather than crash if none are left.
    const available = activePsUpOptions(ctx);
    if (available.length === 0) return;
    // PLAYERSCORE UP! cards are fungible - no need to ask which active one to use.
    const psUpId = available[0].id;
    const playerOptions = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId =
      playerOptions.length === 1
        ? playerOptions[0]
        : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Attach it to which player?", options: playerOptions, allowNone: true, cancelLabel: "Don't use this" };
    if (!targetInstanceId) return ctx.cancelEventAndRefund();
    // "+2 Health for each PLAYERSCORE UP! attached in this way" is tied to that specific PS
    // UP staying attached (see attachPsUpForced's bonusPerAttach doc comment), not a
    // permanent buff - it disappears once the PS UP detaches (Recover, etc).
    ctx.attachPsUpForced(ctx.self, psUpId, targetInstanceId, { health: 2 });
    ctx.healCurrent(targetInstanceId, 2);
  },
});
