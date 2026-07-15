import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Scottie (Player): "If your opponent is using an effect directed at only 1 of the
// players on your field, redirect the effect to this player. If this player is still on
// the field after the effect, discard this player."
//
// Modeled as a passive shield flag rather than a normal activatable OPPONENTS_TURN source:
// the actual redirect decision point is inside chooseOpponentPlayerTarget() (see
// _helpers.js), which every "choose 1 of your opponent's players" effect should route
// through so this shield can intercept when exactly one target is eligible.
registerEffect("001-041", staticFlags({ interceptsSingleTargetOpponentEffects: true }));
