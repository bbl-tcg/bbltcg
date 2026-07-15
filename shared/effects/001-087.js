import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Coach Buffalo (Head Coach, static): "If you have a STAR Player on your field, all
// non-STAR players on your field gain +1 Attack."
registerEffect(
  "001-087",
  staticFlags({
    modifyAllOwnAttack(ctx, baseAttack) {
      if (ctx.instance.isStarPlayer) return baseAttack;
      const hasStarPlayer = ctx.player().playerSlots.some((s) => s && s.isStarPlayer);
      return hasStarPlayer ? baseAttack + 1 : baseAttack;
    },
  })
);
