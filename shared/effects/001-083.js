import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Nova Leer (Player, SACRIFICE): redirect ability.
registerEffect("001-083", redirectAttackEffect());
