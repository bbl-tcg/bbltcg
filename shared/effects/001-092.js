import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Skib Bidi (Player, SACRIFICE): redirect ability.
registerEffect("001-092", redirectAttackEffect());
