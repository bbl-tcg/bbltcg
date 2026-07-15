import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Xander Diamond (Player, SACRIFICE): redirect ability.
registerEffect("001-053", redirectAttackEffect());
