import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Leo Haze (Star Player).
// Main (static): attacks immune to opponent effects, same text as Chef Luis.
// Star Power (FALLEN FORCE, WHILE_ATTACKING): "For every 4 cards in your discard pile,
// this player gains +1 Attack."
registerStarPlayerEffect(
  "001-094",
  { trigger: null, staticEffect: { attacksImmuneToOpponentEffects: true } },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx) {
      return ctx.player().discard.length >= 4;
    },
    *resolve(ctx, windowCtx) {
      const bonus = Math.floor(ctx.player().discard.length / 4);
      ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-094-starPower", attack: bonus, expires: { endOfTurn: ctx.state.turnNumber } });
    },
  }
);
