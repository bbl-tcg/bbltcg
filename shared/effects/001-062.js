import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { synergySearchEventEffect } from "./_helpers.js";

// Ballex Pereira (Star Player).
// Main (ON_OPPONENTS_ATTACK): "If this player has not yet attacked in this game, and it
// is being attacked by a player on your opponent's field, swap this player's current
// Health with a player on your opponent's field until your opponent's End Phase." (A
// one-time exchange is enough - each side's own next Recover phase independently resets
// their own field to full Health anyway, achieving the same effect as swapping back.)
// Star Power (SYNERGY, WHILE_ATTACKING): "If Duke Perrier is on your field, search your
// discard pile for an Event and add it to your hand."
registerStarPlayerEffect(
  "001-062",
  {
    trigger: TRIGGER.ON_OPPONENTS_ATTACK,
    canActivate(ctx, windowCtx) {
      if (ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId]) return false;
      if (!windowCtx || windowCtx.targetPlayerIndex !== ctx.self) return false;
      const target = ctx.player().playerSlots[windowCtx.targetSlot];
      return !!target && target.instanceId === ctx.source.instanceId;
    },
    *resolve(ctx, windowCtx) {
      const self = ctx.findInstance(ctx.source.instanceId).instance;
      const attackerFound = ctx.findInstance(windowCtx.attackerInstanceId);
      if (!attackerFound) return;
      const attacker = attackerFound.instance;
      const temp = self.currentHealth;
      self.currentHealth = attacker.currentHealth;
      attacker.currentHealth = temp;
    },
  },
  synergySearchEventEffect(TRIGGER.WHILE_ATTACKING, "Duke Perrier")
);
