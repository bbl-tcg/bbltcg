import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Simon Chapman (Star Player).
// Main (YOUR_TURN): "If this player has not yet attacked in this game, pick a card from
// your opponent's hand without seeing the front of their cards. Your opponent must
// discard this card and draw 1 card from their deck."
// Star Power (PRESSURE POINT, WHILE_ATTACKING): "Select one of your opponent's active
// PLAYERSCORE UP! and set it in the rested position."
registerStarPlayerEffect(
  "001-030",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && ctx.player(ctx.opponent).hand.length > 0;
    },
    *resolve(ctx) {
      const oppHand = ctx.player(ctx.opponent).hand;
      const idx = Math.floor(ctx.rng() * oppHand.length);
      ctx.discardFromHandAt(ctx.opponent, idx);
      ctx.draw(ctx.opponent, 1);
    },
  },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx) {
      return ctx.player(ctx.opponent).psField.some((p) => p.isActive && !p.attachedTo);
    },
    *resolve(ctx) {
      // PLAYERSCORE UP! cards are fungible - no need to ask which active one to rest.
      const psUp = ctx.player(ctx.opponent).psField.find((p) => p.isActive && !p.attachedTo);
      if (psUp) psUp.isActive = false;
    },
  }
);
