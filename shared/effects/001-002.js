import { registerEffect } from "../engine/effectRegistry.js";
import { conditionalStatBoost } from "./_helpers.js";

const BOOSTING_MONTHS = ["February", "October", "December"];

// Eliezer Edwards (Player, static): "If your opponent has a Head Coach with [February],
// [October], or [December] team, this player gains +2 Health and +3 Attack."
registerEffect(
  "001-002",
  conditionalStatBoost({
    conditionFn: (ctx) => {
      const oppHeadCoach = ctx.state.players[ctx.opponent].headCoach.cardId;
      const months = ctx.card(oppHeadCoach).months || [];
      return months.some((m) => BOOSTING_MONTHS.includes(m));
    },
    attack: 3,
    health: 2,
  })
);
