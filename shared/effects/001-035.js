import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Bucky (Player, SACRIFICE): redirect ability.
registerEffect("001-035", redirectAttackEffect());
