import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Coach Mourinho (Head Coach): "Players on your field cannot be removed from the field
// by effects from your opponent's players." Consulted via
// _helpers.js's isFieldProtectedFromOpponentEffects() by any Player-card effect that
// forcibly removes an opposing player from the field.
registerEffect("001-047", staticFlags({ protectsFieldFromOpponentPlayerEffects: true }));
