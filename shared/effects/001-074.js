import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Tessa Sparks (Player, SACRIFICE): redirect ability.
registerEffect("001-074", redirectAttackEffect());
