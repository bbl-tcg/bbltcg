import "../shared/engine/nodeCardDbLoader.js";
import "../shared/effects/index.js";
import { allCards } from "../shared/engine/cardDb.js";
import { getEffect } from "../shared/engine/effectRegistry.js";

let missing = 0;
for (const card of allCards()) {
  const hasEffect = !!getEffect(card.id);
  const isNoneEffect = card.effect === "NONE";
  if (!hasEffect && !isNoneEffect) {
    missing += 1;
    console.log(`MISSING: ${card.id} ${card.name} (${card.type}) - "${card.effect}"`);
  }
}
console.log(`\n${allCards().length} total cards, ${missing} missing an implementation.`);
if (missing > 0) process.exitCode = 1;
