import { registerEffect } from "../engine/effectRegistry.js";
import { conditionalStatBoost } from "./_helpers.js";
import { SPEED } from "../engine/constants.js";
import { effectiveSpeed } from "../engine/stats.js";

// Alex Ramirez (Player, static): "If there are 2 other Fast players on your field, this
// player gains +1 Attack."
registerEffect(
  "001-061",
  conditionalStatBoost({
    conditionFn: (ctx) => {
      const others = ctx.player().playerSlots.filter((s) => s && s.instanceId !== ctx.instance.instanceId);
      return others.filter((s) => effectiveSpeed(s) === SPEED.FAST).length >= 2;
    },
    attack: 1,
  })
);
