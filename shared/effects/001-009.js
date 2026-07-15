import { registerEffect } from "../engine/effectRegistry.js";
import { redirectAttackEffect } from "./_helpers.js";

// Rafael Murray (Player, SACRIFICE): "If your opponent uses an attack on one of your
// other players, you may redirect that attack to this player."
registerEffect("001-009", redirectAttackEffect());
