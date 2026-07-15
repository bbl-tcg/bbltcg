// Reusable effect-definition factories for text patterns that repeat across many cards
// (redirect abilities, "may discard from hand" prompts, "put a card on/off the field", etc).
// Each factory returns a plain EffectDef (or a function producing one), same shape as an
// inline registerEffect() call, so cards with byte-identical rules text share one
// implementation instead of 20 copy-pasted files.

import { TRIGGER } from "../engine/constants.js";
import { getStaticFlag } from "../engine/stats.js";

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

/**
 * Shared target-picker for "choose 1 of your opponent's players [meeting some filter]"
 * effects (a very common pattern in this set). Routes through here rather than a raw
 * `yield { type: "CHOOSE_OPPONENT_PLAYER", ... }` so redirect-shield cards like Scottie
 * ("if your opponent is using an effect directed at only 1 of the players on your field,
 * redirect the effect to this player... if it survives, discard it") can intercept it when
 * exactly one eligible target exists. `eligible` is the caller's already-filtered instance
 * list (e.g. cost <= N); returns the chosen instance id.
 */
export function* chooseOpponentPlayerTarget(ctx, { prompt, eligible }) {
  // Individually-immune cards (e.g. Chris P. Bacon: "cannot be removed from the field by
  // any of your opponent's player, coach, or event effects") are never valid targets here,
  // regardless of whatever cost/other filter the caller already applied.
  eligible = eligible.filter((s) => getStaticFlag(s, "cannotBeRemovedByOpponentEffects") !== true);

  if (eligible.length === 1) {
    const shield = ctx.player(ctx.opponent).playerSlots.find((s) => s && s.instanceId !== eligible[0].instanceId && getStaticFlag(s, "interceptsSingleTargetOpponentEffects"));
    if (shield) {
      const wantsRedirect = yield { type: "CHOOSE_YES_NO", forPlayer: ctx.opponent, prompt: `Redirect this effect to ${ctx.card(shield.cardId).name}?` };
      if (wantsRedirect) {
        ctx.schedulePostEffectHook({ type: "DISCARD_IF_SURVIVED", instanceId: shield.instanceId });
        return shield.instanceId;
      }
    }
    return eligible[0]?.instanceId ?? null;
  }
  if (eligible.length === 0) return null;
  const options = eligible.map((s) => s.instanceId);
  return yield { type: "CHOOSE_OPPONENT_PLAYER", prompt, options };
}

/**
 * "Players on your field cannot be removed from the field by effects from your opponent's
 * players" (Coach Mourinho). Any effect that removes an *opposing* player from the field
 * (discard, bottom-of-deck, etc. - not attacks/KO, which are a separate mechanic) should
 * check this before doing so. `targetPlayerIndex` is whoever owns the card being removed.
 */
export function isFieldProtectedFromOpponentEffects(ctx, targetPlayerIndex) {
  const headCoachId = ctx.state.players[targetPlayerIndex].headCoach.cardId;
  return getStaticFlag({ cardId: headCoachId, buffs: [] }, "protectsFieldFromOpponentPlayerEffects") === true;
}

/**
 * "If a JanJan on your field did not attack on your last turn, you may attach 1 rested
 * PLAYERSCORE UP! to the JanJan on your field. JanJan gains +1 Health for each
 * PLAYERSCORE UP! attached in this way." Shared by Coach Romano (Head Coach) and Coach
 * Tall (Assistant Coach) - byte-identical text.
 */
export function janJanPsUpBoostEffect() {
  function findJanJan(ctx) {
    return ctx.player().playerSlots.find((s) => s && ctx.card(s.cardId).name === "JanJan");
  }
  function didNotAttackLastTurn(ctx, janJan) {
    return !ctx.state.log.some((e) => e.type === "ATTACK" && e.attackerInstanceId === janJan.instanceId && e.turn === ctx.state.turnNumber - 1);
  }
  function restedPsUpOptions(ctx) {
    return ctx.player().psField.filter((p) => !p.isActive && !p.attachedTo);
  }
  return {
    trigger: TRIGGER.OPPONENTS_TURN,
    canActivate(ctx) {
      const janJan = findJanJan(ctx);
      return !!janJan && didNotAttackLastTurn(ctx, janJan) && restedPsUpOptions(ctx).length > 0;
    },
    *resolve(ctx) {
      const janJan = findJanJan(ctx);
      const options = restedPsUpOptions(ctx).map((p) => p.id);
      const psUpId = options.length === 1 ? options[0] : yield { type: "CHOOSE_PS_UP", prompt: "Attach which rested PLAYERSCORE UP! to JanJan?", options };
      ctx.attachPsUpForced(ctx.self, psUpId, janJan.instanceId);
      ctx.addBuff(janJan.instanceId, { source: "janJanPsUpBoost", health: 1, expires: "permanent" });
    },
  };
}

/**
 * "SYNERGY: If <teammateName> is on your field, search your discard pile for an Event
 * and add it to your hand." Shared by Ballex Pereira and Justin Wells's star powers
 * (different trigger windows, identical body).
 */
export function synergySearchEventEffect(trigger, teammateName) {
  return {
    trigger,
    canActivate(ctx) {
      const hasTeammate = ctx.player().playerSlots.some((s) => s && ctx.card(s.cardId).name === teammateName);
      return hasTeammate && ctx.searchZone(ctx.self, "discard", (c) => c.type === "Event").length > 0;
    },
    *resolve(ctx) {
      const events = ctx.searchZone(ctx.self, "discard", (c) => c.type === "Event");
      const chosen = events.length === 1 ? events[0] : yield { type: "CHOOSE_DISCARD_CARD", prompt: "Add which Event from your discard pile to your hand?", options: events };
      const player = ctx.player();
      const idx = player.discard.indexOf(chosen.cardId);
      if (idx !== -1) {
        player.discard.splice(idx, 1);
        player.hand.push(chosen.cardId);
      }
    },
  };
}

/**
 * "If this [card] has already attacked this turn, you may discard this card from your
 * field. If you do, inflict 2 more damage onto the player you attacked with this [card]."
 * Shared by Himmy Neutron (001-052) and Doc McQueen (001-089) - identical text.
 */
export function extraDamageOnDiscardEffect() {
  function lastAttackTargetSlot(ctx) {
    const self = ctx.findInstance(ctx.source.instanceId);
    const lastAttack = self?.instance.lastAttack;
    if (!lastAttack || lastAttack.turnNumber !== ctx.state.turnNumber) return null;
    const targetPlayer = ctx.player(lastAttack.targetPlayerIndex);
    const slot = targetPlayer.playerSlots.findIndex((s) => s && s.instanceId === lastAttack.targetInstanceId);
    return slot === -1 ? null : { targetPlayerIndex: lastAttack.targetPlayerIndex, slot };
  }
  return {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      const self = ctx.findInstance(ctx.source.instanceId);
      return !!self?.instance.hasAttackedThisTurn && !!lastAttackTargetSlot(ctx);
    },
    *resolve(ctx) {
      const target = lastAttackTargetSlot(ctx);
      ctx.discardFieldSlot(ctx.self, ctx.source.slot);
      if (target) ctx.dealDamage(target.targetPlayerIndex, target.slot, 2);
    },
  };
}

/** "Draw N cards from your deck[, then] discard M cards from your hand." Shared by Coach
 * Rocky, Vin Zero, Michael Shelby, and any future card with the same shape. */
export function drawThenDiscardEffect(trigger, drawCount, discardCount) {
  return {
    trigger,
    canActivate(ctx) {
      return ctx.player().deck.length > 0;
    },
    *resolve(ctx) {
      ctx.draw(ctx.self, drawCount);
      const handSize = ctx.player().hand.length;
      const count = Math.min(discardCount, handSize);
      if (count === 0) return;
      const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
      const chosen = yield { type: "CHOOSE_CARDS", prompt: `Discard ${count} card(s) from your hand`, options, min: count, max: count };
      for (const c of chosen || []) ctx.discardFromHandById(ctx.self, c.cardId ?? c);
    },
  };
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
