import assert from "node:assert/strict";
import "../shared/engine/nodeCardDbLoader.js";
import "../shared/effects/index.js";
import { buildStarterDeckList, getCard } from "../shared/engine/cardDb.js";
import { makeRng } from "../shared/engine/rng.js";
import {
  initializeGame,
  drawOpeningHand,
  mulligan,
  keepHand,
  drawScoreCards,
  playOpeningCard,
  rollForFirstPick,
  setFirstPlayer,
} from "../shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "../shared/engine/turn.js";
import * as engine from "../shared/engine/engine.js";
import { validateDeck } from "../shared/engine/deckLegality.js";
import { drawPsUpFromDeck, createFieldInstance } from "../shared/engine/primitives.js";

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failCount += 1;
    console.error(`  FAIL - ${name}`);
    console.error(err);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failCount += 1;
    console.error(`  FAIL - ${name}`);
    console.error(err);
  }
}

function isPlayerish(cardId) {
  const t = getCard(cardId).type;
  return t === "Player" || t === "StarPlayer";
}

function freshGameBeforeMulliganDecision(seed = 42) {
  const rng = makeRng(seed);
  const deckA = buildStarterDeckList("January");
  const deckB = buildStarterDeckList("January");
  const state = initializeGame({
    playerADef: { id: "A", name: "Player A", ...deckA },
    playerBDef: { id: "B", name: "Player B", ...deckB },
    rng,
  });
  drawOpeningHand(state, 0, rng);
  drawOpeningHand(state, 1, rng);
  return { state, rng };
}

function freshGame(seed = 42) {
  const { state, rng } = freshGameBeforeMulliganDecision(seed);
  keepHand(state, 0);
  keepHand(state, 1);
  drawScoreCards(state, 0);
  drawScoreCards(state, 1);
  return { state, rng };
}

// ---- Deck legality ----
console.log("Deck legality:");
test("January starter deck is legal", () => {
  const deck = buildStarterDeckList("January");
  const result = validateDeck(deck);
  assert.equal(result.legal, true, `Expected legal, got errors: ${JSON.stringify(result.errors)}`);
  assert.equal(deck.mainDeck.length, 60);
});

test("a deck missing cards is rejected", () => {
  const deck = { headCoachId: "001-007", mainDeck: ["001-001"], psDeckCount: 5 };
  const result = validateDeck(deck);
  assert.equal(result.legal, false);
});

// ---- Setup flow ----
console.log("Setup flow:");
test("opening hands contain a Player/StarPlayer, score piles have 2 cards", () => {
  const { state } = freshGame();
  assert.equal(state.players[0].hand.length, 5);
  assert.equal(state.players[1].hand.length, 5);
  assert.equal(state.players[0].score.length, 2);
  assert.equal(state.players[1].score.length, 2);
});

test("mulligan reshuffles hand and can only be used once", () => {
  const { state, rng } = freshGameBeforeMulliganDecision();
  const ok1 = mulligan(state, 0, rng);
  assert.equal(ok1, true);
  assert.equal(state.players[0].hand.length, 5);
  const ok2 = mulligan(state, 0, rng);
  assert.equal(ok2, false, "second mulligan should be rejected");
});

test("opening player card placement and die roll / first player selection", () => {
  const { state, rng } = freshGame();
  const roll = rollForFirstPick(rng);
  assert.notEqual(roll.playerARoll, roll.playerBRoll);
  setFirstPlayer(state, roll.winnerIndex);
  assert.equal(state.turnNumber, 1);
  assert.equal(state.activePlayerIndex, roll.winnerIndex);

  const idx = state.players[0].hand.findIndex(isPlayerish);
  const result = playOpeningCard(state, 0, idx);
  assert.equal(result.ok, true);
  assert.notEqual(state.players[0].playerSlots[0], null);
});

// ---- Turn/phase mechanics ----
console.log("Turn phases:");
test("first turn of the game disallows attacking and draws only 1 PLAYERSCORE UP!", () => {
  const { state, rng } = freshGame();
  const roll = rollForFirstPick(rng);
  setFirstPlayer(state, roll.winnerIndex);
  const idx = state.players[roll.winnerIndex].hand.findIndex(isPlayerish);
  playOpeningCard(state, roll.winnerIndex, idx);

  startTurn(state);
  assert.equal(state.turnFlags.attacksAllowed, false);
  assert.equal(state.players[roll.winnerIndex].psField.length, 1, "first player's first turn draws only 1 PS UP");
});

test("recover phase heals a damaged field and returns attached/rested PS UP", () => {
  const { state } = freshGame();
  setFirstPlayer(state, 0);
  const idx = state.players[0].hand.findIndex(isPlayerish);
  playOpeningCard(state, 0, idx);
  const inst = state.players[0].playerSlots[0];
  const maxHealth = getCard(inst.cardId).health;
  inst.currentHealth = 1;
  drawPsUpFromDeck(state, 0, 2);
  state.players[0].psField[0].isActive = false;

  startTurn(state);
  assert.equal(state.players[0].playerSlots[0].currentHealth, maxHealth);
  assert.equal(state.players[0].psField.every((p) => p.isActive), true);
});

// ---- Combat + KO/score ----
console.log("Combat:");
await asyncTest("attack deals damage, KOes at 0 health, and grants the defender a Score draw", async () => {
  const { state } = freshGame();
  setFirstPlayer(state, 0);
  playOpeningCard(state, 0, state.players[0].hand.findIndex(isPlayerish));
  playOpeningCard(state, 1, state.players[1].hand.findIndex(isPlayerish));

  startTurn(state); // P0 turn 1: no attacking
  endTurnPhase(state);
  startTurn(state); // P1 turn 1: no attacking
  endTurnPhase(state);
  startTurn(state); // P0 turn 2: attacking allowed
  assert.equal(state.turnFlags.attacksAllowed, true);

  const defender = state.players[1].playerSlots[0];
  defender.currentHealth = 1; // force a KO regardless of the actual attack roll
  const scoreBefore = state.players[1].score.length;

  const result = await engine.attack(state, { attackerPlayerIndex: 0, attackerSlot: 0, targetPlayerIndex: 1, targetSlot: 0 }, async () => null);
  assert.equal(result.ok, true);
  assert.equal(result.koed, true);
  assert.equal(state.players[1].playerSlots[0], null);
  assert.equal(state.players[1].score.length, scoreBefore - 1);
  assert.equal(state.players[1].discard.includes(defender.cardId), true);
});

// ---- Sample effects ----
console.log("Sample effects:");
await asyncTest("Deck Sphera: rests 1 PS UP and free-plays a Skuba Doo from hand when available", async () => {
  const { state } = freshGame();
  setFirstPlayer(state, 0);
  const player = state.players[0];
  player.hand = ["001-001", "001-006"];
  playOpeningCard(state, 0, 0); // Deck Sphera as the free opening play
  startTurn(state);
  drawPsUpFromDeck(state, 0, 1); // guarantee a payable PS UP beyond the automatic PS-draw

  const before = player.playerSlots.filter((s) => s).length;
  const available = engine.getActivatableSources(state, 0, "YOUR_TURN");
  const deckSpheraSource = available.find((s) => s.cardId === "001-001");
  assert.ok(deckSpheraSource, "Deck Sphera's effect should be activatable with a Skuba Doo in hand");

  const result = await engine.activateEffectAction(state, 0, deckSpheraSource, "YOUR_TURN", {}, async () => null);
  assert.equal(result.ok, true);
  const after = player.playerSlots.filter((s) => s).length;
  assert.equal(after, before + 1, "Skuba Doo should now be on the field");
  assert.equal(player.playerSlots.some((s) => s && s.cardId === "001-006"), true);
});

await asyncTest("Skuba Doo star power: +3 Attack WHILE_ATTACKING if a teammate already attacked this turn", async () => {
  const { state } = freshGame();
  setFirstPlayer(state, 0);
  const player = state.players[0];
  player.hand = ["001-001"];
  playOpeningCard(state, 0, 0);
  startTurn(state);
  endTurnPhase(state);
  startTurn(state); // player B's forced first-turn no-attack
  endTurnPhase(state);
  startTurn(state); // back to player A, attacks now allowed

  const filler = createFieldInstance("001-002", state.turnNumber);
  filler.hasAttackedThisTurn = true;
  player.playerSlots[1] = filler;
  const skuba = createFieldInstance("001-006", state.turnNumber - 5); // well past its Power Up Turns
  player.playerSlots[2] = skuba;

  const opponent = state.players[1];
  const dummyTarget = createFieldInstance("001-002", state.turnNumber);
  opponent.playerSlots[0] = dummyTarget;

  const available = engine.getActivatableSources(state, 0, "WHILE_ATTACKING", { attackerInstanceId: skuba.instanceId });
  assert.ok(available.some((s) => s.cardId === "001-006" && s.label === "starPower"));

  const result = await engine.attack(state, { attackerPlayerIndex: 0, attackerSlot: 2, targetPlayerIndex: 1, targetSlot: 0 }, async () => null);
  assert.equal(result.ok, true);
  // base attack 7 (Skuba Doo) + 3 (star power) + possible speed bonus, well above the dummy's health -> KO.
  assert.equal(result.koed, true);
});

console.log(`\n${passCount} passed, ${failCount} failed.`);
if (failCount > 0) {
  process.exitCode = 1;
  console.error("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}
