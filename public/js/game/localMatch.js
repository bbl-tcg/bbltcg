import { getCard } from "/shared/engine/cardDb.js";
import { makeRng } from "/shared/engine/rng.js";
import { initializeGame, drawOpeningHand, mulligan, keepHand, drawScoreCards, playOpeningCard, rollForFirstPick, setFirstPlayer, isEligibleForOpeningField } from "/shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "/shared/engine/turn.js";
import * as engine from "/shared/engine/engine.js";
import { getStaticFlag } from "/shared/engine/stats.js";
import { renderBoard, cardImg } from "./render.js";
import { showChoice } from "./choiceModal.js";
import { showCardZoomWithActions } from "./cardZoom.js";
import { enrichChoiceRequest, windowThreatInfo } from "./choiceEnrich.js";
import { runBotTurn, autoResolveForBot, chooseBotReaction } from "../bot/ai.js";
import { animateAttackSwipe, animateCardMove } from "./animations.js";
import { isLoggedIn, reportGameResult } from "../api.js";
import { confirmDialog } from "../ui.js";

let G = null;
let turnTimerInterval = null;

// A player's own turn (from startTurn to End Turn, including whatever they do mid-turn) has
// a 2.5-minute clock; running it out force-ends the turn. Two run-outs in a row (no normal
// end-turn in between) is an automatic loss - see waitForHumanTurn.
const TURN_TIME_MS = 2.5 * 60 * 1000;

export async function startLocalMatch({ deckA, deckB, vsBot, firstPlayerChoice = "random" }) {
  const rng = makeRng((Date.now() % 1e9) + Math.floor(Math.random() * 1e6));
  const state = initializeGame({
    playerADef: { id: "A", name: deckA.name || "Player 1", ...deckA },
    playerBDef: { id: "B", name: deckB.name || "Player 2", ...deckB },
    rng,
  });

  // Playmats are cosmetic-only and never reach the engine's own state (createPlayerState
  // only destructures the fields it actually knows about), so they're carried here instead
  // and applied directly to the board DOM in render() below.
  G = {
    state,
    vsBot,
    humanIndex: 0,
    armedSlot: null,
    gameOverShown: false,
    turnDeadline: null,
    consecutiveTimeouts: [0, 0],
    playmats: [deckA.playmatUrl ?? null, deckB.playmatUrl ?? null],
  };

  drawOpeningHand(state, 0, rng);
  drawOpeningHand(state, 1, rng);
  await maybeOfferMulligan(0, rng);
  await maybeOfferMulligan(1, rng);
  keepHand(state, 0);
  keepHand(state, 1);
  drawScoreCards(state, 0);
  drawScoreCards(state, 1);

  if (firstPlayerChoice === "me") {
    setFirstPlayer(state, G.humanIndex);
    toast("You go first.");
  } else if (firstPlayerChoice === "opponent") {
    setFirstPlayer(state, G.humanIndex === 0 ? 1 : 0);
    toast("Opponent goes first.");
  } else {
    const roll = rollForFirstPick(rng);
    const winnerIndex = roll.winnerIndex;
    const winnerLabel = G.vsBot ? (winnerIndex === G.humanIndex ? "You" : "The bot") : `Player ${winnerIndex + 1}`;
    toast(`${winnerLabel} won the die roll (${roll.playerARoll} vs ${roll.playerBRoll}).`);

    let firstIndex;
    if (isBotSeat(winnerIndex)) {
      firstIndex = winnerIndex; // bots always choose to go first
    } else {
      const choice = await showChoice({ type: "CHOOSE_FIRST_OR_SECOND", prompt: `${winnerLabel} won the die roll - go first or second?` });
      firstIndex = choice === "second" ? (winnerIndex === 0 ? 1 : 0) : winnerIndex;
    }
    setFirstPlayer(state, firstIndex);
    const firstLabel = G.vsBot ? (firstIndex === G.humanIndex ? "You" : "The bot") : `Player ${firstIndex + 1}`;
    toast(`${firstLabel} will go first.`);
  }

  for (const p of [0, 1]) {
    await pickOpeningCard(p);
  }

  await runTurnLoop();
}

async function maybeOfferMulligan(playerIndex, rng) {
  if (isBotSeat(playerIndex)) return; // bots always keep for now
  const hand = G.state.players[playerIndex].hand;
  const wantsMulligan = await showChoice({ type: "MULLIGAN_PROMPT", prompt: `Player ${playerIndex + 1}'s hand - mulligan (redraw once)?`, cardIds: hand });
  if (wantsMulligan) mulligan(G.state, playerIndex, rng);
}

async function pickOpeningCard(playerIndex) {
  const state = G.state;
  const hand = state.players[playerIndex].hand;
  const candidates = hand.map((cardId, handIndex) => ({ cardId, handIndex })).filter((e) => isEligibleForOpeningField(e.cardId));
  let handIndex;
  if (isBotSeat(playerIndex) || candidates.length === 1) {
    handIndex = candidates[0].handIndex;
  } else {
    const chosen = await showChoice({
      type: "CHOOSE_HAND_CARD",
      prompt: `Player ${playerIndex + 1}: choose your opening Player (Cost 3 or less; played free)`,
      options: candidates,
    });
    handIndex = chosen.handIndex;
  }
  playOpeningCard(state, playerIndex, handIndex);
}

function isBotSeat(playerIndex) {
  return G.vsBot && playerIndex !== G.humanIndex;
}

function makeResolver(actingControllerIndex) {
  return async (request) => {
    const forPlayer = request.forPlayer ?? actingControllerIndex;
    if (isBotSeat(forPlayer)) return autoResolveForBot(request);
    return showChoice(enrichChoiceRequest(G.state, request));
  };
}

/**
 * Decides which (if any) activatable source to use at a reactive window. For a human seat
 * this always asks - including an explicit "do nothing" choice - since being auto-enrolled
 * into using a reaction card the moment it's available would take away a real decision
 * (whether to react at all, and with which card if several qualify).
 */
async function decideWindow(controllerIndex, available, windowCtx) {
  if (available.length === 0) return null;
  if (isBotSeat(controllerIndex)) return chooseBotReaction(G.state, controllerIndex, available, windowCtx);

  const options = available.map((s) => ({ cardId: s.cardId, label: `${getCard(s.cardId).name}${s.label !== "main" ? ` (${s.label})` : ""}`, value: s }));
  const chosen = await showChoice({
    type: "CHOOSE_EFFECT_SOURCE",
    prompt: "You may react with one of these cards, or pass.",
    options,
    allowNone: true,
    ...windowThreatInfo(G.state, windowCtx),
  });
  return chosen || null;
}

async function runTurnLoop() {
  while (!G.state.gameOver) {
    startTurn(G.state);
    if (G.state.gameOver) {
      render();
      break;
    }

    const me = G.state.activePlayerIndex;
    if (isBotSeat(me)) {
      G.turnDeadline = null; // bots act near-instantly - no clock needed
      render();
      toast("Opponent's turn...");
      await runBotTurn(G.state, me, render, makeResolver(me), decideWindow);
      if (G.state.gameOver) break;
      await engine.endTurn(G.state, me, makeResolver(me), decideWindow);
      render();
      continue;
    }

    // Set the deadline *before* the render() inside waitForHumanTurn so the very first
    // paint of this turn already shows the real countdown instead of a stale one.
    G.turnDeadline = Date.now() + TURN_TIME_MS;
    render();
    await waitForHumanTurn(me);
    if (G.state.gameOver) break;
  }
  render();
  showGameOver();
}

/** Resolves once the human playing seat `me` clicks "End Turn" *or* their clock runs out.
 * All the interim actions (playing cards, attacking, activating effects) are wired as click
 * handlers in render() and call back into engine functions directly; this promise just
 * waits for one of those two ways a turn can end. Timing out twice in a row (no voluntary
 * end-turn in between) is an automatic loss - a player who runs the clock out once gets a
 * warning-by-example, not immediate elimination, but doing it again right after is treated
 * as having walked away from the game. */
function waitForHumanTurn(me) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = async (timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      G.endTurnResolve = null;
      if (timedOut) {
        G.consecutiveTimeouts[me] += 1;
        if (G.consecutiveTimeouts[me] >= 2) {
          G.state.gameOver = true;
          G.state.winner = me === 0 ? 1 : 0;
          render();
          resolve();
          return;
        }
      } else {
        G.consecutiveTimeouts[me] = 0;
      }
      await engine.endTurn(G.state, me, makeResolver(me), decideWindow);
      render();
      resolve();
    };

    G.endTurnResolve = () => finish(false);
    const timer = setTimeout(() => finish(true), Math.max(0, G.turnDeadline - Date.now()));
  });
}

function render() {
  const container = document.getElementById("game-screen");
  container.innerHTML = "";

  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }

  const topbar = document.createElement("div");
  topbar.className = "game-topbar";
  const me = G.state.activePlayerIndex;
  const viewerIndex = G.vsBot ? G.humanIndex : me;
  const isMyTurn = me === viewerIndex;
  topbar.innerHTML = `<div>${isMyTurn ? "Your turn" : "Opponent's turn"} - Turn ${G.state.turnNumber}</div>`;
  if (G.turnDeadline && !G.state.gameOver) {
    const timerEl = document.createElement("div");
    timerEl.className = "turn-timer";
    const updateTimer = () => {
      const remainingSecs = Math.max(0, Math.ceil((G.turnDeadline - Date.now()) / 1000));
      timerEl.textContent = `⏱ ${Math.floor(remainingSecs / 60)}:${String(remainingSecs % 60).padStart(2, "0")}`;
      timerEl.classList.toggle("low", remainingSecs <= 15);
    };
    updateTimer();
    turnTimerInterval = setInterval(updateTimer, 1000);
    topbar.appendChild(timerEl);
  }
  const actions = document.createElement("div");
  actions.className = "topbar-actions";
  const concedeBtn = mkBtn("Concede", onConcede);
  concedeBtn.classList.add("secondary");
  concedeBtn.disabled = !isMyTurn;
  const endBtn = mkBtn("End Turn", () => G.endTurnResolve && G.endTurnResolve());
  endBtn.disabled = !isMyTurn;
  actions.appendChild(concedeBtn);
  actions.appendChild(endBtn);
  topbar.appendChild(actions);
  container.appendChild(topbar);

  const boardArea = document.createElement("div");
  boardArea.style.flex = "1 1 auto";
  boardArea.style.display = "flex";
  boardArea.style.flexDirection = "column";
  boardArea.style.minHeight = "0";
  container.appendChild(boardArea);

  const attackable = new Set();
  const targetable = new Set();
  if (isMyTurn && G.state.turnFlags.attacksAllowed) {
    G.state.players[me].playerSlots.forEach((inst, slot) => {
      if (inst && engine.canAttackWith(G.state, me, slot)) attackable.add(inst.instanceId);
    });
  }
  if (G.armedSlot !== null) {
    const oppIndex = me === 0 ? 1 : 0;
    G.state.players[oppIndex].playerSlots.forEach((inst) => {
      if (inst) targetable.add(inst.instanceId);
    });
  }

  renderBoard(boardArea, G.state, viewerIndex, {
    attackableInstanceIds: attackable,
    targetableInstanceIds: targetable,
    onCoachClick: (playerIndex, zone, cardId) => onCoachClick(playerIndex, zone, cardId, isMyTurn, me),
    onDiscardClick: (playerIndex) => showDiscardViewer(playerIndex),
    onHandCardClick: (handIndex, cardId) => onHandCardClick(handIndex, cardId, isMyTurn, me),
    onFieldCardClick: (playerIndex, slot, inst) => onFieldCardClick(playerIndex, slot, inst, isMyTurn, me),
  });
  applyPlaymats(boardArea, viewerIndex);
}

/** Sets each side's field background from its deck's saved playmat (see deckbuilder.js) -
 * applied here rather than threaded through renderBoard()'s own signature, since only the
 * caller knows which playmat belongs to which visible side. No-op (falls back to the default
 * CSS background) for a side with no playmat set. */
function applyPlaymats(boardArea, viewerIndex) {
  const opponentIndex = viewerIndex === 0 ? 1 : 0;
  const opponentArea = boardArea.querySelector(".opponent-area");
  const playerArea = boardArea.querySelector(".player-area");
  if (opponentArea) opponentArea.style.backgroundImage = G.playmats[opponentIndex] ? `url(${G.playmats[opponentIndex]})` : "";
  if (playerArea) playerArea.style.backgroundImage = G.playmats[viewerIndex] ? `url(${G.playmats[viewerIndex]})` : "";
}

function mkBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "bbl-btn";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

async function onConcede() {
  if (!(await confirmDialog("Concede this game?"))) return;
  const viewerIndex = G.vsBot ? G.humanIndex : G.state.activePlayerIndex;
  const oppIndex = viewerIndex === 0 ? 1 : 0;
  G.state.gameOver = true;
  G.state.winner = oppIndex;
  G.state.winReason = "concede";
  showGameOver();
}

/** Clicking any hand card zooms in on it; a "Play" action appears only when actually legal
 * right now (correct trigger window for Events, normal play-legality for everything else). */
function onHandCardClick(handIndex, cardId, isMyTurn, me) {
  const card = getCard(cardId);
  const actions = [];
  if (isMyTurn) {
    if (card.type === "Event") {
      const sources = engine.getActivatableSources(G.state, me, "YOUR_TURN");
      const match = sources.find((s) => s.zone === "HAND" && s.handIndex === handIndex);
      if (match) {
        actions.push({
          label: "Play",
          onClick: async () => {
            await engine.activateEffectAction(G.state, me, match, "YOUR_TURN", {}, makeResolver(me));
            render();
          },
        });
      }
    } else {
      const check = engine.canPlayCard(G.state, me, handIndex);
      if (check.ok) {
        actions.push({ label: "Play", onClick: () => playFieldCardFromHand(handIndex, cardId, card, me) });
      }
    }
  }
  showCardZoomWithActions(cardId, actions);
}

async function playFieldCardFromHand(handIndex, cardId, card, me) {
  let replaceSlot = null;
  if ((card.type === "Player" || card.type === "StarPlayer") && !G.state.players[me].playerSlots.some((s) => s === null)) {
    const chosen = await showChoice(
      enrichChoiceRequest(G.state, {
        type: "CHOOSE_OWN_PLAYER",
        prompt: "Your 3 player slots are full - replace which one?",
        options: G.state.players[me].playerSlots.map((s) => s.instanceId),
        allowNone: true,
        cancelLabel: "Don't play this card",
      })
    );
    if (!chosen) return; // cancelled - card stays in hand, nothing paid
    replaceSlot = G.state.players[me].playerSlots.findIndex((s) => s.instanceId === chosen);
  }

  const sourceEl = document.querySelector(`.hand-card .card-face[data-hand-index="${handIndex}"]`);
  const startRect = sourceEl?.getBoundingClientRect();

  const result = await engine.playCard(G.state, me, handIndex, { replaceSlot }, makeResolver(me));
  if (!result.ok) {
    toast(`Can't play that: ${result.reason}`);
    render();
    return;
  }
  render();
  if (result.instance && startRect) {
    const destEl = document.querySelector(`[data-instance-id="${result.instance.instanceId}"]`);
    if (destEl) {
      const endRect = destEl.getBoundingClientRect();
      destEl.style.visibility = "hidden";
      await animateCardMove(startRect, cardImg(cardId), endRect);
      destEl.style.visibility = "";
    }
  }
}

async function onFieldCardClick(playerIndex, slot, inst, isMyTurn, me) {
  if (!inst) return;
  const oppIndex = me === 0 ? 1 : 0;

  // Mid-attack targeting takes priority over zoom: clicking the armed card un-arms it,
  // clicking an opposing card declares the attack.
  //
  // Only an opponent's card can be *declared* as the target from the UI - the rare
  // teammate-targeting case (e.g. Ricky Covey Jr.'s GREATER GOOD star power) isn't a
  // player choice made here at all, it's the attacking card's own effect silently
  // rewriting the target mid-resolution inside engine.attack(). The animation below reads
  // the *actual* resolved target back out of the attack log afterward for exactly that
  // reason, rather than trusting what was clicked.
  if (G.armedSlot !== null && playerIndex === oppIndex) {
    const attackerInstanceId = G.state.players[me].playerSlots[G.armedSlot]?.instanceId;
    const result = await engine.attack(G.state, { attackerPlayerIndex: me, attackerSlot: G.armedSlot, targetPlayerIndex: oppIndex, targetSlot: slot }, makeResolver(me), decideWindow);
    G.armedSlot = null;
    if (!result.ok) {
      toast(`Attack failed: ${result.reason}`);
      render();
      return;
    }

    const attackEvent = [...G.state.log].reverse().find((e) => e.type === "ATTACK" && e.attackerInstanceId === attackerInstanceId);
    const attackerEl = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`);
    const targetEl = attackEvent ? document.querySelector(`[data-instance-id="${attackEvent.targetInstanceId}"]`) : null;
    await animateAttackSwipe(attackerEl, targetEl);
    render();
    return;
  }

  if (G.armedSlot !== null && playerIndex === me && slot === G.armedSlot) {
    G.armedSlot = null; // un-arm
    render();
    return;
  }

  // Otherwise: zoom in, offering whichever actions make sense for this card right now.
  const actions = [];
  if (isMyTurn && playerIndex === me) {
    if (engine.canAttackWith(G.state, me, slot)) {
      actions.push({ label: "Attack", onClick: () => { G.armedSlot = slot; render(); } });
    }
    const hasActivePsUp = G.state.players[me].psField.some((p) => p.isActive && !p.attachedTo);
    const canAttachPsUp = !inst.isStarPlayer || getStaticFlag(inst, "allowsNormalPsUpAttachment") === true;
    if (hasActivePsUp && canAttachPsUp) {
      actions.push({ label: "Attach PLAYERSCORE UP! (+1 Attack)", onClick: () => attachPsUpToField(me, inst.instanceId) });
    }
    const effectSources = [...engine.getActivatableSources(G.state, me, "YOUR_TURN"), ...engine.getActivatableSources(G.state, me, "SACRIFICE")].filter(
      (s) => s.instanceId === inst.instanceId
    );
    for (const src of effectSources) {
      actions.push({
        label: `Activate: ${getCard(src.cardId).name}${src.label !== "main" ? ` (${src.label})` : ""}`,
        onClick: async () => {
          await engine.activateEffectAction(G.state, me, src, src.effectDef.trigger, {}, makeResolver(me));
          render();
        },
      });
    }
  }
  showCardZoomWithActions(inst.cardId, actions);
}

function attachPsUpToField(me, targetInstanceId) {
  const psUp = G.state.players[me].psField.find((p) => p.isActive && !p.attachedTo);
  if (!psUp) return;
  const result = engine.attachPsUpAction(G.state, me, psUp.id, targetInstanceId);
  if (!result.ok) toast(`Can't attach: ${result.reason}`);
  render();
}

/** Head Coach / Assistant Coach click: zoom in, offering an activation action per
 * applicable effect (there's no attack/PS-UP action for coaches). */
function onCoachClick(playerIndex, zone, cardId, isMyTurn, me) {
  const actions = [];
  if (isMyTurn && playerIndex === me) {
    const sources = [...engine.getActivatableSources(G.state, me, "YOUR_TURN"), ...engine.getActivatableSources(G.state, me, "SACRIFICE")].filter((s) => s.zone === zone);
    for (const src of sources) {
      actions.push({
        label: `Activate: ${getCard(src.cardId).name}`,
        onClick: async () => {
          await engine.activateEffectAction(G.state, me, src, src.effectDef.trigger, {}, makeResolver(me));
          render();
        },
      });
    }
  }
  showCardZoomWithActions(cardId, actions);
}

function showDiscardViewer(playerIndex) {
  const overlay = document.createElement("div");
  overlay.className = "discard-viewer-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  const panel = document.createElement("div");
  panel.className = "discard-viewer-panel bbl-panel";
  panel.innerHTML = `<div style="font-weight:800;color:var(--bbl-blue);">Discard Pile (${G.state.players[playerIndex].discard.length} cards, most recent first)</div>`;
  const grid = document.createElement("div");
  grid.className = "discard-viewer-grid";
  [...G.state.players[playerIndex].discard].reverse().forEach((cardId) => {
    const img = document.createElement("img");
    img.src = cardImg(cardId);
    img.style.cursor = "pointer";
    img.onclick = () => showCardZoomWithActions(cardId, []);
    grid.appendChild(img);
  });
  panel.appendChild(grid);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function toast(message) {
  const t = document.createElement("div");
  t.textContent = message;
  Object.assign(t.style, {
    position: "fixed",
    bottom: "140px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bbl-black)",
    color: "white",
    padding: "8px 16px",
    borderRadius: "8px",
    zIndex: 200,
    fontWeight: "700",
    maxWidth: "80vw",
    textAlign: "center",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function showGameOver() {
  if (G.gameOverShown) return;
  G.gameOverShown = true;
  const viewerIndex = G.vsBot ? G.humanIndex : 0;
  const youWon = G.state.winner === viewerIndex;
  // Hot-seat has no single "you" to credit (it's typically one account playing both
  // sides locally), so only vs-bot games report a Pack Points result. A loss by conceding
  // gets 0 Pack Points instead of the normal 2 - see server/routes/packs.js.
  const result = youWon ? "win" : G.state.winReason === "concede" ? "concede" : "loss";
  if (G.vsBot && isLoggedIn()) reportGameResult(result).catch(() => {});
  const overlay = document.createElement("div");
  overlay.className = "card-zoom-overlay";
  overlay.innerHTML = `
    <div class="bbl-panel" style="padding:32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:800;color:${youWon ? "var(--bbl-blue)" : "var(--bbl-red)"};">
        ${G.vsBot ? (youWon ? "You win!" : "You lose!") : `Player ${(G.state.winner ?? 0) + 1} wins!`}
      </div>
      <button class="bbl-btn" style="margin-top:16px;" onclick="location.reload()">Back to Menu</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
