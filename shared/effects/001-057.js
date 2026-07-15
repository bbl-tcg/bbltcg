import { registerEffect } from "../engine/effectRegistry.js";
import { conditionalStatBoost } from "./_helpers.js";

// Penelope Stark (Player, static): "If at least 1 Alex Ramirez is on your field, this
// player gains +1 Health."
registerEffect(
  "001-057",
  conditionalStatBoost({
    conditionFn: (ctx) => ctx.player().playerSlots.some((s) => s && ctx.card(s.cardId).name === "Alex Ramirez"),
    health: 1,
  })
);
