import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Duke Perrier (Player, static): attacks immune to opponent effects, same text as Chef Luis.
registerEffect("001-059", staticFlags({ attacksImmuneToOpponentEffects: true }));
