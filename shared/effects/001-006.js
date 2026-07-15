import { registerEffect, registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Skuba Doo (Star Player).
// Main: "If this player has not yet attacked in this game, you may put up to 2
// PLAYERSCORE UP! cards back in your PS Deck. For each PLAYERSCORE UP! you remove from
// the field in this way, draw 1 card from your deck to your hand."
// Star Power (PUMMEL DOWN, WHILE_ATTACKING): "If a different player on your field has
// already attacked on this turn, this player gains +3 Attack."
registerStarPlayerEffect(
  "001-006",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      const inst = ctx.source.instanceId && ctx.findInstance(ctx.source.instanceId);
      return !!inst && !inst.instance.hasAttackedThisTurn && !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId];
    },
    *resolve(ctx) {
      const choice = yield {
        type: "CHOOSE_NUMBER",
        prompt: "Return how many PLAYERSCORE UP! to your PS Deck? (0-2)",
        min: 0,
        max: 2,
      };
      const count = Math.max(0, Math.min(2, choice ?? 0));
      const returned = ctx.returnPsUpToDeck(ctx.self, count);
      if (returned > 0) ctx.draw(ctx.self, returned);
    },
  },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx, windowCtx) {
      const player = ctx.player();
      return player.playerSlots.some(
        (s) => s && s.hasAttackedThisTurn && s.instanceId !== windowCtx.attackerInstanceId
      );
    },
    *resolve(ctx, windowCtx) {
      ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-006-starPower", attack: 3, expires: { endOfTurn: ctx.state.turnNumber } });
    },
  }
);
