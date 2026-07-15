import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Lalo (Player, static): attacks immune to opponent effects, same text as Chef Luis.
registerEffect("001-085", staticFlags({ attacksImmuneToOpponentEffects: true }));
