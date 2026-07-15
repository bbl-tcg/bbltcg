import { registerEffect } from "../engine/effectRegistry.js";

// Chef Luis (Player): "This player's attacks are not affected by your opponent's player or
// coach effects." Static/always-on; other effects that would modify or interrupt an attack
// made BY this card should consult stats.getStaticFlag(instance, "attacksImmuneToOpponentEffects").
registerEffect("001-003", {
  trigger: null,
  staticEffect: {
    attacksImmuneToOpponentEffects: true,
  },
});
