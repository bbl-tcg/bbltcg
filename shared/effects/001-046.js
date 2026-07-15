import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { chooseOpponentPlayerTarget } from "./_helpers.js";

// Miguel Borja, Jr. (Star Player).
// Main (YOUR_TURN): "If this player has not yet attacked in this game, choose one of the
// players on your opponent's field and give it -1 Health until your End Phase."
// Star Power (DISRUPTION, WHILE_ATTACKING): "Your opponent must choose 1 card from their
// hand and discard it."
registerStarPlayerEffect(
  "001-046",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && ctx.player(ctx.opponent).playerSlots.some((s) => s);
    },
    *resolve(ctx) {
      const eligible = ctx.player(ctx.opponent).playerSlots.filter((s) => s);
      const targetInstanceId = yield* chooseOpponentPlayerTarget(ctx, { prompt: "Give -1 Health to which opponent player?", eligible });
      ctx.healCurrent(targetInstanceId, -1);
    },
  },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx) {
      return ctx.player(ctx.opponent).hand.length > 0;
    },
    *resolve(ctx) {
      const options = ctx.player(ctx.opponent).hand.map((cardId, handIndex) => ({ cardId, handIndex }));
      const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", forPlayer: ctx.opponent, prompt: "Choose 1 card to discard", options };
      ctx.discardFromHandById(ctx.opponent, chosen.cardId);
    },
  }
);
