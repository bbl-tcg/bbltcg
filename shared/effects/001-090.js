import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { drawThenDiscardEffect } from "./_helpers.js";

// Vin Zero (Player, ON_PLAY): "Draw 3 cards from your deck, then discard 2 cards from
// your hand."
registerEffect("001-090", drawThenDiscardEffect(TRIGGER.ON_PLAY, 3, 2));
