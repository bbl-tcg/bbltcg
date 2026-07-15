// Reusable effect-definition factories for text patterns that repeat across many cards
// (redirect abilities, "may discard from hand" prompts, "put a card on/off the field", etc).
// Each factory returns a plain EffectDef (or a function producing one), same shape as an
// inline registerEffect() call, so cards with byte-identical rules text share one
// implementation instead of 20 copy-pasted files.

import { TRIGGER } from "../engine/constants.js";

/**
 * "If your opponent uses an attack on one of your other players, you may redirect that
 * attack to this player." Shared by Banned (001-004), Rafael Murray (001-009), Mal
 * (001-021), and any future card with the same text.
 */
export function redirectAttackEffect() {
  return {
    trigger: TRIGGER.SACRIFICE,
    canActivate(ctx, windowCtx) {
      if (!windowCtx || windowCtx.targetPlayerIndex !== ctx.self) return false;
      if (windowCtx.targetSlot === ctx.source.slot) return false; // already the target
      return !!ctx.findInstance(ctx.source.instanceId);
    },
    *resolve(ctx, windowCtx) {
      windowCtx.targetSlot = ctx.source.slot;
      ctx.log({ type: "ATTACK_REDIRECTED", toInstanceId: ctx.source.instanceId });
    },
  };
}

/** A purely static/passive effect exposing one or more flags for other effects/engine code to consult. */
export function staticFlags(flags) {
  return { trigger: null, staticEffect: flags };
}

/** "This player's stat gains a flat bonus while <conditionFn(ctx)> is true." */
export function conditionalStatBoost({ conditionFn, attack = 0, health = 0 }) {
  return {
    trigger: null,
    staticEffect: {
      modifyOwnAttack(ctx, baseAttack) {
        return conditionFn(ctx) ? baseAttack + attack : baseAttack;
      },
      modifyOwnMaxHealth(ctx, baseHealth) {
        return conditionFn(ctx) ? baseHealth + health : baseHealth;
      },
    },
  };
}
