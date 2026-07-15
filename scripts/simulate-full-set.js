// Like simulate.js, but builds legal decks for EVERY month from the full 156-card pool
// (not just the 4 starter decks), so cards outside the starter lists get exercised too.
import "../shared/engine/nodeCardDbLoader.js";
import "../shared/effects/index.js";
import { allCards, getCard } from "../shared/engine/cardDb.js";
import { makeRng, shuffle } from "../shared/engine/rng.js";
import { validateDeck } from "../shared/engine/deckLegality.js";
import { initializeGame, drawOpeningHand, keepHand, drawScoreCards, playOpeningCard, rollForFirstPick, setFirstPlayer } from "../shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "../shared/engine/turn.js";
import * as engine from "../shared/engine/engine.js";

const MAX_TURNS = 150;

function isPlayerish(cardId) {
  const t = getCard(cardId).type;
  return t === "Player" || t === "StarPlayer";
}

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
    default: {
      const options = request.options;
      if (Array.isArray(options) && options.length > 0) return options[0];
      return null;
    }
  }
}

/** Build one legal 60-card + 5-PS-UP deck for a given month, using every eligible card
 * available (up to 5 copies), cycling through candidates to fill exactly 60. */
function buildDeckForMonth(month, rng) {
  const cards = allCards();
  const headCoach = cards.find((c) => c.type === "HeadCoach" && c.months.includes(month));
  if (!headCoach) return null;

  const eligible = cards.filter((c) => {
    if (c.type === "HeadCoach") return false;
    if (c.type === "Event") return true; // month-unlocked, see RULES_NOTES.md #4
    return c.months.includes(month);
  });

  const mainDeck = [];
  const shuffled = shuffle(eligible, rng);
  let i = 0;
  while (mainDeck.length < 60 && shuffled.length > 0) {
    const card = shuffled[i % shuffled.length];
    const currentCount = mainDeck.filter((id) => getCard(id).name === card.name).length;
    if (currentCount < 5) mainDeck.push(card.id);
    i += 1;
    if (i > 2000) break; // safety valve if a month doesn't have enough unique card pool
  }

  return { headCoachId: headCoach.id, mainDeck, psDeckCount: 5 };
}

async function playOneGame(deckA, deckB, seed) {
  const rng = makeRng(seed);
  const state = initializeGame({
    playerADef: { id: "A", name: "A", ...deckA },
    playerBDef: { id: "B", name: "B", ...deckB },
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
    const idx = state.players[p].hand.findIndex(isPlayerish);
    if (idx !== -1) playOpeningCard(state, p, idx);
  }

  let turns = 0;
  while (!state.gameOver && turns < MAX_TURNS) {
    turns += 1;
    startTurn(state);
    const me = state.activePlayerIndex;

    for (let i = 0; i < 6; i++) {
      const available = [...engine.getActivatableSources(state, me, "YOUR_TURN"), ...engine.getActivatableSources(state, me, "SACRIFICE")];
      if (available.length === 0) break;
      await engine.activateEffectAction(state, me, available[0], available[0].effectDef.trigger, {}, autoResolve);
      if (state.gameOver) break;
    }
    if (state.gameOver) break;

    for (let i = 0; i < 4; i++) {
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

  return { turns, gameOver: state.gameOver, hitCap: turns >= MAX_TURNS && !state.gameOver };
}

async function main() {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  let played = 0;
  let crashed = 0;
  let cappedOut = 0;
  let illegalDecks = 0;

  const rngForDecks = makeRng(1234);
  for (const monthA of months) {
    const monthB = months[(months.indexOf(monthA) + 1) % months.length];
    const deckA = buildDeckForMonth(monthA, rngForDecks);
    const deckB = buildDeckForMonth(monthB, rngForDecks);
    if (!deckA || !deckB) continue;

    const va = validateDeck(deckA);
    const vb = validateDeck(deckB);
    if (!va.legal || !vb.legal) {
      illegalDecks += 1;
      console.warn(`  illegal deck ${monthA}: ${JSON.stringify(va.errors)} | ${monthB}: ${JSON.stringify(vb.errors)}`);
      continue;
    }

    for (let g = 0; g < 2; g++) {
      played += 1;
      const seed = played * 104729 + g;
      try {
        const result = await playOneGame(deckA, deckB, seed);
        if (result.hitCap) {
          cappedOut += 1;
          console.warn(`  [${monthA} vs ${monthB} seed=${seed}] hit ${MAX_TURNS}-turn cap`);
        }
      } catch (err) {
        crashed += 1;
        console.error(`  CRASH [${monthA} vs ${monthB} seed=${seed}]:`, err.stack || err);
      }
    }
  }

  console.log(`\n${played} games across all 12 months, ${illegalDecks} illegal deck-builds, ${crashed} crashed, ${cappedOut} hit the turn cap.`);
  if (crashed > 0 || illegalDecks > 0) process.exitCode = 1;
  else console.log("FULL-SET SIMULATION PASSED");
}

main();
