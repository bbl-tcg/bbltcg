import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { revealTopKeepOneEffect } from "./_helpers.js";

// Yen Durmont (Player, ON_PLAY): "Draw 3 cards from your deck. Put 1 in your hand, and
// discard the rest."
registerEffect("001-019", revealTopKeepOneEffect(TRIGGER.ON_PLAY, 3));
