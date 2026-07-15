import { TRIGGER } from "./constants.js";
import { getEffect } from "./effectRegistry.js";
import { makeEffectContext } from "./effectContext.js";
import { runEffect } from "./effectRunner.js";

function onKoDefFor(cardId) {
  const effectDef = getEffect(cardId);
  if (!effectDef) return null;
  return effectDef.main?.trigger === TRIGGER.ON_KO ? effectDef.main : effectDef.trigger === TRIGGER.ON_KO ? effectDef : null;
}

/**
 * Fires ON_KO effects right before a card is physically removed from the field:
 * - the KOed card's own ON_KO effect (e.g. Cyclops "inflict the same amount of damage as
 *   the last attack used on this Cyclops...").
 * - any OTHER card on the same owner's field whose ON_KO effect opts into
 *   `reactsToAnyOwnKo: true` (e.g. LeBall James "if one of your players is KOed, search
 *   your discard pile..." - registered as ON_KO for engine purposes even though the
 *   source data lists no trigger, since it's an automatic reaction to a KO event rather
 *   than a passive stat modifier; see RULES_NOTES.md).
 *
 * Lives in its own module (not engine.js) so combat.js can call it without an import cycle
 * (engine.js imports combat.js).
 */
export async function triggerOnKoIfApplicable(state, playerIndex, slot, resolveChoice) {
  const player = state.players[playerIndex];
  const koedInst = player.playerSlots[slot];
  if (!koedInst) return;

  const selfDef = onKoDefFor(koedInst.cardId);
  if (selfDef) {
    const source = { cardId: koedInst.cardId, zone: "FIELD", instanceId: koedInst.instanceId, slot };
    const ctx = makeEffectContext(state, { controllerIndex: playerIndex, source });
    if (!selfDef.canActivate || selfDef.canActivate(ctx)) {
      await runEffect(selfDef.resolve(ctx), resolveChoice);
    }
  }

  for (let otherSlot = 0; otherSlot < player.playerSlots.length; otherSlot++) {
    if (otherSlot === slot) continue;
    const inst = player.playerSlots[otherSlot];
    if (!inst) continue;
    const def = onKoDefFor(inst.cardId);
    if (!def || !def.reactsToAnyOwnKo) continue;
    const source = { cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, slot: otherSlot };
    const ctx = makeEffectContext(state, { controllerIndex: playerIndex, source });
    if (def.canActivate && !def.canActivate(ctx)) continue;
    await runEffect(def.resolve(ctx), resolveChoice);
  }
}
