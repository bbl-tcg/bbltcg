import { registerEffect } from "../engine/effectRegistry.js";
import { staticFlags } from "./_helpers.js";

// Chris P. Bacon (Player, static): "This player cannot be attacked or KOed. If it is the
// only player on your field at the start of your turn, move this player from your field to
// your Score face-up (gain 1 life). When this card is drawn from the Score, move it
// directly to the discard pile. Only one Chris P. Bacon can be on the field at a time."
registerEffect(
  "001-069",
  staticFlags({
    blocksAttackFrom: () => true,
    immuneToDamage: true,
    uniqueOnField: true,
    autoScoreIfAloneAtTurnStart: true,
    discardIfDrawnFromScore: true,
  })
);
