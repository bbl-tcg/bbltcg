import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";

// Ricky Covey Jr. (Star Player, May) - the card explicitly called out for teammate-targeting attacks.
// Main (static): "If this player has not yet attacked in this game, it cannot be attacked
// by players with a Cost of 3 or less."
// Star Power (GREATER GOOD, WHILE_ATTACKING): "Choose 1 of the players on your field, and
// attack it instead. If it falls to 0 Health, it is discarded instead of KOed. If it is
// discarded as a result of this attack, choose 1 player on your opponent's field to be put
// at the bottom of their deck."
registerStarPlayerEffect(
  "001-038",
  {
    trigger: null,
    staticEffect: {
      blocksAttackFrom(ctx, attackerInstance) {
        if (ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId]) return false;
        return effectiveCost(attackerInstance) <= 3;
      },
    },
  },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx, windowCtx) {
      return ctx.player().playerSlots.some((s) => s && s.instanceId !== windowCtx.attackerInstanceId);
    },
    *resolve(ctx, windowCtx) {
      const options = ctx
        .player()
        .playerSlots.filter((s) => s && s.instanceId !== windowCtx.attackerInstanceId)
        .map((s) => s.instanceId);
      const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Attack which teammate instead?", options };
      const targetSlot = ctx.player().playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
      windowCtx.targetPlayerIndex = ctx.self;
      windowCtx.targetSlot = targetSlot;
      windowCtx.suppressScoreDrawOnZeroHealth = true;
      ctx.schedulePostAttackHook({ type: "BOTTOM_DECK_IF_DISCARDED", controllerIndex: ctx.self });
    },
  }
);
