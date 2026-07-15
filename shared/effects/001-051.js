import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Alistair Frost (Player, static): "This player's attacks are not affected by your
// opponent's player or coach effects." Same text as Chef Luis (001-003).
registerEffect("001-051", staticFlags({ attacksImmuneToOpponentEffects: true }));
