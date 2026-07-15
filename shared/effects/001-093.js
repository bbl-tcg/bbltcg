import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { drawThenDiscardEffect } from "./_helpers.js";

// Michael Shelby (Player, ON_PLAY): "Draw 5 cards from your deck, then discard 3 cards
// from your hand."
registerEffect("001-093", drawThenDiscardEffect(TRIGGER.ON_PLAY, 5, 3));
