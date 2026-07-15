import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Viktor Krill (Player, SACRIFICE): redirect ability.
registerEffect("001-060", redirectAttackEffect());
