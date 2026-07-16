// Headless bot-vs-bot simulation: plays full games using a naive "always do something if
// legal" policy, to catch crashes/infinite loops across many card effects at once. This is
// a smoke test for engine robustness, not a correctness check of individual card text.
import "../shared/engine/nodeCardDbLoader.js";
import "../shared/effects/index.js";
import { buildStarterDeckList, starterDeckNames, getCard } from "../shared/engine/cardDb.js";
import { makeRng } from "../shared/engine/rng.js";
import { initializeGame, drawOpeningHand, keepHand, drawScoreCards, playOpeningCard, rollForFirstPick, setFirstPlayer, isEligibleForOpeningField } from "../shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "../shared/engine/turn.js";
import * as engine from "../shared/engine/engine.js";

const MAX_TURNS = 200;
const GAMES_PER_DECK_PAIR = 3;

// Answers any yielded choice request with a simple, always-terminating default so the
// generator loop can't hang waiting on an unanswered decision.
function autoResolve(request) {
  switch (request.type) {
    case "CHOOSE_YES_NO":
      return false;
    case "CHOOSE_NUMBER":
      return request.min ?? 0;
    case "CHOOSE_CARDS":
      return (request.options || []).slice(0, request.min ?? 0).map((o) => o.cardId ?? o);
    case "CHOOSE_HAND_CARD_OPTIONAL":
      return null;
    case "CHOOSE_OPPONENT_PLAYERS":
      return (request.options || []).slice(0, request.count ?? 0);
    case "CHOOSE_TWO_OWN_PLAYERS":
      return (request.options || []).slice(0, 2);
    default: {
      const options = request.options;
      if (Array.isArray(options) && options.length > 0) {
        const first = options[0];
        return typeof first === "object" ? first : first;
      }
      return null;
    }
  }
}

async function playOneGame(deckNameA, deckNameB, seed) {
  const rng = makeRng(seed);
  const deckA = buildStarterDeckList(deckNameA);
  const deckB = buildStarterDeckList(deckNameB);
  const state = initializeGame({
    playerADef: { id: "A", name: deckNameA, ...deckA },
    playerBDef: { id: "B", name: deckNameB, ...deckB },
    rng,
  });
  drawOpeningHand(state, 0, rng);
  drawOpeningHand(state, 1, rng);
  keepHand(state, 0);
  keepHand(state, 1);
  drawScoreCards(state, 0);
  drawScoreCards(state, 1);

  const roll = rollForFirstPick(rng);
  setFirstPlayer(state, roll.winnerIndex);
  for (const p of [0, 1]) {
    const idx = state.players[p].hand.findIndex(isEligibleForOpeningField);
    if (idx !== -1) playOpeningCard(state, p, idx);
  }

  let turns = 0;
  while (!state.gameOver && turns < MAX_TURNS) {
    turns += 1;
    startTurn(state);
    const me = state.activePlayerIndex;

    // Try any YOUR_TURN / SACRIFICE effects a few times (bounded, since availability can
    // legitimately persist across a couple of independent sources).
    for (let i = 0; i < 5; i++) {
      const available = [
        ...engine.getActivatableSources(state, me, "YOUR_TURN"),
        ...engine.getActivatableSources(state, me, "SACRIFICE"),
      ];
      if (available.length === 0) break;
      const source = available[0];
      await engine.activateEffectAction(state, me, source, source.effectDef.trigger, {}, autoResolve);
      if (state.gameOver) break;
    }
    if (state.gameOver) break;

    // Try to play the cheapest affordable card from hand a few times.
    for (let i = 0; i < 3; i++) {
      const player = state.players[me];
      const playable = player.hand
        .map((cardId, handIndex) => ({ cardId, handIndex, card: getCard(cardId) }))
        .filter((e) => e.card.type !== "HeadCoach")
        .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0));
      let played = false;
      for (const candidate of playable) {
        const check = engine.canPlayCard(state, me, candidate.handIndex);
        if (!check.ok) continue;
        const result = await engine.playCard(state, me, candidate.handIndex, { replaceSlot: 0 }, autoResolve);
        if (result.ok) {
          played = true;
          break;
        }
      }
      if (!played || state.gameOver) break;
    }
    if (state.gameOver) break;

    // Attack with everything that can legally attack.
    for (let slot = 0; slot < state.players[me].playerSlots.length; slot++) {
      if (!engine.canAttackWith(state, me, slot)) continue;
      const opp = me === 0 ? 1 : 0;
      const targetSlot = state.players[opp].playerSlots.findIndex((s) => s);
      if (targetSlot === -1) continue;
      await engine.attack(state, { attackerPlayerIndex: me, attackerSlot: slot, targetPlayerIndex: opp, targetSlot }, autoResolve);
      if (state.gameOver) break;
    }
    if (state.gameOver) break;

    await engine.endTurn(state, me, autoResolve);
  }

  return { turns, gameOver: state.gameOver, winner: state.winner, hitTurnCap: turns >= MAX_TURNS && !state.gameOver };
}

async function main() {
  const decks = starterDeckNames();
  let played = 0;
  let crashed = 0;
  let cappedOut = 0;

  for (const deckA of decks) {
    for (const deckB of decks) {
      for (let g = 0; g < GAMES_PER_DECK_PAIR; g++) {
        played += 1;
        const seed = played * 7919 + g;
        try {
          const result = await playOneGame(deckA, deckB, seed);
          if (result.hitTurnCap) {
            cappedOut += 1;
            console.warn(`  [${deckA} vs ${deckB} seed=${seed}] hit ${MAX_TURNS}-turn cap without ending`);
          }
        } catch (err) {
          crashed += 1;
          console.error(`  CRASH [${deckA} vs ${deckB} seed=${seed}]:`, err.stack || err);
        }
      }
    }
  }

  console.log(`\n${played} simulated games, ${crashed} crashed, ${cappedOut} hit the turn cap without ending.`);
  if (crashed > 0) process.exitCode = 1;
  else console.log("SIMULATION SMOKE TEST PASSED");
}

main();
