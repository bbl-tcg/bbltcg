import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Hawk (Player, static): attacks immune to opponent effects, same text as Chef Luis.
registerEffect("001-077", staticFlags({ attacksImmuneToOpponentEffects: true }));
