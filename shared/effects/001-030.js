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
      // In multiplayer, the client only ever sees a redacted copy of the opponent's hand
      // (contents hidden, `hand: []` with a `handCount` standing in for the real length -
      // see server/multiplayer.js's redactStateFor) - this canActivate() runs client-side
      // just to decide whether to show the "Activate" button, so reading `.hand.length`
      // directly always saw 0 there and hid the button even when the server-side (real,
      // unredacted) check would have allowed it. `handCount` is undefined on the real state
      // objects canActivate also runs against (both singleplayer and the server's own
      // authoritative check), so this falls through to the real length there.
      const opponent = ctx.player(ctx.opponent);
      const opponentHandSize = opponent.handCount ?? opponent.hand.length;
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && opponentHandSize > 0;
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
