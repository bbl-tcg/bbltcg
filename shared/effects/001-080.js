import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Coach Stark (Assistant Coach, static): "While this card is on your field, you cannot
// use your Coach Belichick effect. Every player on your field gains +1 Attack." (The
// Coach Belichick lockout is implemented as a direct check inside Coach Belichick's own
// canActivate - see 001-079.js.)
registerEffect(
  "001-080",
  staticFlags({
    modifyAllOwnAttack(ctx, baseAttack) {
      return baseAttack + 1;
    },
  })
);
