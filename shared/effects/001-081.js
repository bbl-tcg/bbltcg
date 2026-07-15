import { registerEffect } from "../engine/effectRegistry.js";
import { conditionalStatBoost } from "./_helpers.js";

const BOOSTING_MONTHS = ["January", "March", "June"];

// Jaylen Andersen (Player, static): "If your opponent has a Head Coach with [January],
// [March], or [June] team, this player gains +2 Attack."
registerEffect(
  "001-081",
  conditionalStatBoost({
    conditionFn: (ctx) => {
      const oppHeadCoach = ctx.state.players[ctx.opponent].headCoach.cardId;
      const months = ctx.card(oppHeadCoach).months || [];
      return months.some((m) => BOOSTING_MONTHS.includes(m));
    },
    attack: 2,
  })
);
