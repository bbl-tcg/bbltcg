import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";

// Hal Lewis (Star Player).
// Main (YOUR_TURN, win condition): "If this player has not yet attacked in this game,
// there are 3 8-Cost players on the field, and Goodbye, R1P1... is played, you win."
// ("On the field" read as your own field, matching every other card's default when it
// doesn't say "your opponent's.") "...is played" checked against this same turn.
// Star Power (AFTERMATH, ON_KO): "If, after this Hal Lewis is KOed, you have fewer Score
// cards remaining than your opponent, your opponent may discard 2 cards from their hand.
// If they don't, choose 1 of the players on their field to KO."
function goodbyeR1P1PlayedThisTurn(ctx) {
  return ctx.state.log.some((e) => e.type === "EFFECT_ACTIVATED" && e.cardId === "001-115" && e.controllerIndex === ctx.self && e.turn === ctx.state.turnNumber);
}

registerStarPlayerEffect(
  "001-086",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      if (ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId]) return false;
      const eightCostCount = ctx.player().playerSlots.filter((s) => s && effectiveCost(s) === 8).length;
      return eightCostCount >= 3 && goodbyeR1P1PlayedThisTurn(ctx);
    },
    *resolve(ctx) {
      ctx.state.gameOver = true;
      ctx.state.winner = ctx.self;
      ctx.log({ type: "GAME_OVER", winnerIndex: ctx.self, reason: "HAL_LEWIS_WIN_CONDITION" });
    },
  },
  {
    trigger: TRIGGER.ON_KO,
    canActivate(ctx) {
      return ctx.player().score.length < ctx.player(ctx.opponent).score.length;
    },
    *resolve(ctx) {
      const wantsDiscard = yield { type: "CHOOSE_YES_NO", forPlayer: ctx.opponent, prompt: "Discard 2 cards from your hand? (otherwise a player of yours will be KOed)" };
      if (wantsDiscard) {
        const options = ctx.player(ctx.opponent).hand.map((cardId, handIndex) => ({ cardId, handIndex }));
        const count = Math.min(2, options.length);
        const chosen =
          count === 0
            ? []
            : yield { type: "CHOOSE_CARDS", forPlayer: ctx.opponent, prompt: `Discard ${count} card(s) from your hand`, options, min: count, max: count };
        for (const c of chosen || []) ctx.discardFromHandById(ctx.opponent, c.cardId ?? c);
      } else {
        const eligible = ctx.player(ctx.opponent).playerSlots.filter((s) => s);
        if (eligible.length === 0) return;
        const options = eligible.map((s) => s.instanceId);
        const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OPPONENT_PLAYER", prompt: "Choose 1 opponent player to KO", options };
        const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
        if (slot !== -1) ctx.koSlot(ctx.opponent, slot);
      }
    },
  }
);
