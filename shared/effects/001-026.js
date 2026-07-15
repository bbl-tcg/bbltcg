import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Sting Ray (Player, SACRIFICE): redirect ability, same text as Banned/Rafael Murray.
registerEffect("001-026", redirectAttackEffect());
