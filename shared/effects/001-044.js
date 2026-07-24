import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Peter Crouch (Player, YOUR_TURN): "If your opponent uses a Rebound, nullify its
// effects. If you do, discard this player."
// By the time this is checkable (on your own following turn), Rebound's "+1 Health until
// opponent's End Phase" would already be moot (your Recover phase just reset the field to
// full Health regardless) - so "nullify" is implemented as the tempo play the card text
// implies (discard Peter Crouch to counter it) rather than reversing an already-expired,
// already-harmless health tick.
function opponentPlayedReboundLastTurn(ctx) {
  return ctx.state.log.some(
    (e) => e.type === "EFFECT_ACTIVATED" && e.cardId === "001-098" && e.controllerIndex === ctx.opponent && e.turn === ctx.state.turnNumber - 1
  );
}

registerEffect("001-044", {
  trigger: TRIGGER.YOUR_TURN,
  // Bot AI hint (ai.js) - this unconditionally discards its own source card as part of
  // activating, so the bot shouldn't pick it while it's the bot's only field player.
  selfSacrifice: true,
  canActivate(ctx) {
    return opponentPlayedReboundLastTurn(ctx);
  },
  *resolve(ctx) {
    ctx.log({ type: "REBOUND_NULLIFIED", controllerIndex: ctx.self });
    ctx.discardFieldSlot(ctx.self, ctx.source.slot);
  },
});
