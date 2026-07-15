import { registerEffect } from "../engine/effectRegistry.js";
import { extraDamageOnDiscardEffect } from "./_helpers.js";

// Doc McQueen (Player, YOUR_TURN): same text as Himmy Neutron.
registerEffect("001-089", extraDamageOnDiscardEffect());
