import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { revealTopKeepOneEffect } from "./_helpers.js";

// Silvia Snipes: Rookie (?) of the Year (Event, YOUR_TURN): "Look at the top 3 cards in
// your deck. Add 1 to your hand, and then discard the rest."
registerEffect("001-106", revealTopKeepOneEffect(TRIGGER.YOUR_TURN, 3));
