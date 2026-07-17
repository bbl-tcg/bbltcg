import { getCard } from "/shared/engine/cardDb.js";
import * as engine from "/shared/engine/engine.js";
import { effectiveAttack, effectiveCost, effectiveSpeed, speedTriangleBonus } from "/shared/engine/stats.js";
import { pendingAttackDamage } from "/shared/engine/combat.js";
import { animateAttackSwipe } from "../game/animations.js";

const STEP_DELAY_MS = 650;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Plays out the bot's entire turn as a sequence of discrete, individually-rendered steps
 * (with a short pause between each) so a human opponent can actually watch it happen and
 * react mid-turn, per the game's requirement that bot moves be visible step-by-step. All
 * the actual rule enforcement/attack windows are the same engine calls a human's UI uses;
 * this module only decides *what* the bot chooses to do at each opportunity.
 *
 * `resolveChoice`/`decideWindow` must be the general per-seat dispatchers from
 * localMatch.js (which route a request to the human's UI or the bot's own heuristics
 * based on *whose* decision it actually is - e.g. an effect the bot controls can still ask
 * the human opponent to choose something) - never hardcode the bot's own auto-resolver
 * here, since not every choice that comes up during the bot's turn belongs to the bot.
 */
export async function runBotTurn(state, botIndex, render, resolveChoice, decideWindow) {
  const opponentIndex = botIndex === 0 ? 1 : 0;

  // 1) Use any obviously-available YOUR_TURN/SACRIFICE effects (coaches first, then field).
  for (let i = 0; i < 6; i++) {
    const sources = [...engine.getActivatableSources(state, botIndex, "YOUR_TURN"), ...engine.getActivatableSources(state, botIndex, "SACRIFICE")];
    const chosen = pickBestEffectSource(state, sources);
    if (!chosen) break;
    await engine.activateEffectAction(state, botIndex, chosen, chosen.effectDef.trigger, {}, resolveChoice);
    render();
    await sleep(STEP_DELAY_MS);
  }

  // 2) Play cards from hand, cheapest/most impactful first, filling empty slots before
  // replacing anything.
  for (let i = 0; i < 5; i++) {
    const player = state.players[botIndex];
    const candidates = player.hand
      .map((cardId, handIndex) => ({ cardId, handIndex, card: getCard(cardId) }))
      .filter((e) => e.card.type !== "HeadCoach")
      .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0));

    let playedSomething = false;
    for (const candidate of candidates) {
      if (candidate.card.type === "Event") continue; // events are situational; left for reactive windows / YOUR_TURN pass above
      const check = engine.canPlayCard(state, botIndex, candidate.handIndex);
      if (!check.ok) continue;
      const replaceSlot = player.playerSlots.every((s) => s) ? pickWorstOwnSlot(state, botIndex) : null;
      const result = await engine.playCard(state, botIndex, candidate.handIndex, { replaceSlot }, resolveChoice);
      if (result.ok) {
        playedSomething = true;
        render();
        await sleep(STEP_DELAY_MS);
        break;
      }
    }
    if (!playedSomething) break;
  }

  // 3) Attach any active PLAYERSCORE UP! to non-Star players that can attack this turn,
  // for the free +1 Attack each, before actually attacking.
  const attachTargets = state.players[botIndex].playerSlots
    .map((inst, slot) => ({ inst, slot }))
    .filter(({ inst, slot }) => inst && !inst.isStarPlayer && engine.canAttackWith(state, botIndex, slot));
  for (const { inst } of attachTargets) {
    const psUp = state.players[botIndex].psField.find((p) => p.isActive && !p.attachedTo);
    if (!psUp) break;
    engine.attachPsUpAction(state, botIndex, psUp.id, inst.instanceId);
  }
  if (attachTargets.length) {
    render();
    await sleep(STEP_DELAY_MS);
  }

  // 4) Attack with everything that can legally attack, favoring speed-triangle-favorable
  // and lower-Health opposing targets.
  for (let slot = 0; slot < state.players[botIndex].playerSlots.length; slot++) {
    if (!engine.canAttackWith(state, botIndex, slot)) continue;
    const targetSlot = pickBestTarget(state, botIndex, slot, opponentIndex);
    if (targetSlot === -1) continue;
    const attackerInstanceId = state.players[botIndex].playerSlots[slot]?.instanceId;
    await engine.attack(state, { attackerPlayerIndex: botIndex, attackerSlot: slot, targetPlayerIndex: opponentIndex, targetSlot }, resolveChoice, decideWindow);

    const attackEvent = [...state.log].reverse().find((e) => e.type === "ATTACK" && e.attackerInstanceId === attackerInstanceId);
    const attackerEl = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`);
    const targetEl = attackEvent ? document.querySelector(`[data-instance-id="${attackEvent.targetInstanceId}"]`) : null;
    await animateAttackSwipe(attackerEl, targetEl);
    render();
    await sleep(STEP_DELAY_MS);
    if (state.gameOver) return;
  }
}

function pickBestEffectSource(state, sources) {
  // Cheap heuristic: prefer Head Coach/Assistant Coach utility first, then field effects;
  // skip anything requiring a decision the bot can't meaningfully judge better than "try it".
  if (sources.length === 0) return null;
  const coachFirst = sources.find((s) => s.zone === "HEAD_COACH" || s.zone === "ASSISTANT_COACH");
  return coachFirst || sources[0];
}

function pickWorstOwnSlot(state, playerIndex) {
  const player = state.players[playerIndex];
  let worst = 0;
  let worstScore = Infinity;
  player.playerSlots.forEach((inst, slot) => {
    if (!inst) return;
    const score = effectiveAttack(state, playerIndex, inst) + inst.currentHealth;
    if (score < worstScore) {
      worstScore = score;
      worst = slot;
    }
  });
  return worst;
}

/**
 * Prefers a kill over a non-kill, and among ties prefers the more valuable (higher-Cost)
 * target - e.g. between two lethal targets, finish off the expensive threat rather than
 * whichever happens to have marginally lower Health, and between two non-lethal targets,
 * chip down the bigger long-term problem rather than just the closest-to-death one.
 */
function pickBestTarget(state, attackerIndex, attackerSlot, defenderIndex) {
  const attacker = state.players[attackerIndex].playerSlots[attackerSlot];
  const defenderSlots = state.players[defenderIndex].playerSlots;
  let best = -1;
  let bestScore = -Infinity;
  defenderSlots.forEach((inst, slot) => {
    if (!inst) return;
    const dmg = effectiveAttack(state, attackerIndex, attacker) + speedTriangleBonus(effectiveSpeed(attacker), effectiveSpeed(inst));
    const lethal = inst.currentHealth <= dmg;
    const value = effectiveCost(inst);
    const score = (lethal ? 10000 : 0) + value * 10 - inst.currentHealth;
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  });
  return best;
}

/** Answers a choice yielded by one of the bot's OWN effects (target selection, discard
 * choices, yes/no, etc.) with a simple, always-terminating heuristic. */
export function autoResolveForBot(request) {
  switch (request.type) {
    case "CHOOSE_YES_NO":
      return true;
    case "CHOOSE_FIRST_OR_SECOND":
      return "first";
    case "CHOOSE_NUMBER":
      return request.max ?? request.min ?? 0;
    case "CHOOSE_CARDS": {
      const count = request.min ?? 0;
      return (request.options || []).slice(0, count).map((o) => o.cardId ?? o);
    }
    case "CHOOSE_HAND_CARD_OPTIONAL":
      return null;
    case "CHOOSE_OPPONENT_PLAYERS":
      return (request.options || []).slice(0, request.count ?? 0);
    case "CHOOSE_TWO_OWN_PLAYERS":
      return (request.options || []).slice(0, 2);
    case "CHOOSE_EFFECT_SOURCE":
      return request.options && request.options.length ? request.options[0].value ?? request.options[0] : null;
    default: {
      const options = request.options;
      if (Array.isArray(options) && options.length > 0) return options[0];
      return null;
    }
  }
}

/**
 * Decides whether/which reactive source the bot uses at a reactive window. When the bot is
 * the one attacking, an available WHILE_ATTACKING source is the bot's own optional bonus
 * (e.g. a conditional +Attack) - there's no downside to just taking it. When the bot is
 * defending against the opponent's attack, reactive cards (Rebound/Save/redirects, etc.)
 * are a limited resource - burning one on every single attack regardless of how much
 * damage is actually incoming is exactly the "plays anything it can" behavior that makes
 * the bot feel unstrategic, so only react when the attack in progress would actually KO the
 * threatened player. Non-attack windows (e.g. the broad OPPONENTS_TURN check at end of
 * turn, with no attacker/target in windowCtx at all) fall back to the old always-take-it
 * behavior, since those are standing abilities rather than spent resources.
 */
export function chooseBotReaction(state, controllerIndex, available, windowCtx) {
  if (available.length === 0) return null;
  const botIsDefender = windowCtx?.attackerPlayerIndex !== undefined && windowCtx.attackerPlayerIndex !== controllerIndex;
  if (botIsDefender) {
    const threatened = state.players[windowCtx.targetPlayerIndex]?.playerSlots[windowCtx.targetSlot];
    if (threatened) {
      const dmg = pendingAttackDamage(state, windowCtx);
      if (dmg != null && threatened.currentHealth > dmg) return null; // not lethal - save the resource for a real threat
    }
  }
  return available[0];
}
