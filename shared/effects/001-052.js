import { registerEffect } from "../engine/effectRegistry.js";
import { extraDamageOnDiscardEffect } from "./_helpers.js";

// Himmy Neutron (Player, YOUR_TURN): "If this Himmy Neutron has already attacked this
// turn, you may discard this card from your field. If you do, inflict 2 more damage onto
// the player you attacked with this Himmy Neutron."
registerEffect("001-052", extraDamageOnDiscardEffect());
