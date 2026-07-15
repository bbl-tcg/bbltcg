import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Coach Alex (Assistant Coach, static): "All your players have -1 Cost when you play
// them from your hand to the field. They return to their normal cost when played."
registerEffect(
  "001-088",
  staticFlags({
    modifyHandCost(ctx, baseCost) {
      return baseCost - 1;
    },
  })
);
