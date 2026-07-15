import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Mal (Player, SACRIFICE): redirect ability.
registerEffect("001-021", redirectAttackEffect());
