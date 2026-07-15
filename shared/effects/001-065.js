import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Sepastian Bond (Player, SACRIFICE): redirect ability.
registerEffect("001-065", redirectAttackEffect());
