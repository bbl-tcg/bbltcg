import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Jordan Riki (Player, SACRIFICE): redirect ability.
registerEffect("001-045", redirectAttackEffect());
