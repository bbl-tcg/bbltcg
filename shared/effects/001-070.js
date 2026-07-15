import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { conditionalStatBoost } from "./_helpers.js";

// Ragnar (Star Player).
// Main (static): "If this player has not yet attacked in this game, it has +1 Health
// until it attacks for the first time."
// Star Power (PUMMEL DOWN, WHILE_ATTACKING): same text as Skuba Doo/JanJan - "+3 Attack
// if a different player on your field has already attacked this turn."
registerStarPlayerEffect(
  "001-070",
  conditionalStatBoost({
    conditionFn: (ctx) => !ctx.state.turnFlags.attackedThisGameByInstance[ctx.instance.instanceId],
    health: 1,
  }),
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx, windowCtx) {
      const player = ctx.player();
      return player.playerSlots.some((s) => s && s.hasAttackedThisTurn && s.instanceId !== windowCtx.attackerInstanceId);
    },
    *resolve(ctx, windowCtx) {
      ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-070-starPower", attack: 3, expires: { endOfTurn: ctx.state.turnNumber } });
    },
  }
);
