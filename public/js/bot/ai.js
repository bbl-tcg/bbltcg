import { getCard } from "/shared/engine/cardDb.js";
import * as engine from "/shared/engine/engine.js";
import { effectiveAttack, effectiveSpeed, speedTriangleBonus } from "/shared/engine/stats.js";
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

  // 3) Attack with everything that can legally attack, favoring speed-triangle-favorable
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

function pickBestTarget(state, attackerIndex, attackerSlot, defenderIndex) {
  const attacker = state.players[attackerIndex].playerSlots[attackerSlot];
  const defenderSlots = state.players[defenderIndex].playerSlots;
  let best = -1;
  let bestScore = -Infinity;
  defenderSlots.forEach((inst, slot) => {
    if (!inst) return;
    const dmg = effectiveAttack(state, attackerIndex, attacker) + speedTriangleBonus(effectiveSpeed(attacker), effectiveSpeed(inst));
    const lethal = inst.currentHealth <= dmg;
    const score = (lethal ? 1000 : 0) - inst.currentHealth;
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
    case "CHOOSE_EFFECT_SOURCE":
      return request.options && request.options.length ? request.options[0].value ?? request.options[0] : null;
    default: {
      const options = request.options;
      if (Array.isArray(options) && options.length > 0) return options[0];
      return null;
    }
  }
}

/** Decides whether/which reactive card the bot uses when it's the defending seat during a
 * human's attack. Simple heuristic: react if anything is available and there's a real
 * decision to make; a full "is this attack lethal" read isn't worth the complexity here. */
export function chooseBotReaction(state, controllerIndex, available, windowCtx) {
  if (available.length === 0) return null;
  return available[0];
}
