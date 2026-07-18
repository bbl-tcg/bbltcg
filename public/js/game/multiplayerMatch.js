import { getCard } from "/shared/engine/cardDb.js";
import * as engine from "/shared/engine/engine.js";
import { getStaticFlag } from "/shared/engine/stats.js";
import { renderBoard, cardImg } from "./render.js";
import { showChoice } from "./choiceModal.js";
import { showCardZoomWithActions } from "./cardZoom.js";
import { enrichChoiceRequest, windowThreatInfo } from "./choiceEnrich.js";
import { animateAttackSwipe, animateCardMove } from "./animations.js";
import { toast, confirmDialog } from "../ui.js";
import { currentUser, reportGameResult } from "../api.js";
import { showScreen } from "../screens.js";

let socket = null;
let latestState = null;
let you = null;
let armedSlot = null;
let gameOverShown = false;

// Remembers which room/seat this browser is (or was) in, so a dropped connection - a
// network blip, or the player reloading/reopening the page mid-game - can be resumed
// instead of leaving a stale pre-disconnect board frozen on screen forever. Cleared once
// the game genuinely ends (see showGameOver).
const ACTIVE_ROOM_KEY = "bbltcg_active_mp_room";
function saveActiveRoom(code, playerIndex) {
  try {
    localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({ code, playerIndex }));
  } catch {
    /* storage unavailable (private browsing, etc.) - resume just won't be offered */
  }
}
function loadActiveRoom() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_ROOM_KEY) || "null");
  } catch {
    return null;
  }
}
function clearActiveRoom() {
  try {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    /* ignore */
  }
}

/** Called once at app startup (see app.js) - if this browser was mid-match when it lost
 * its connection, silently try to rejoin that room. Does nothing if there's no stored
 * room, so it's always safe to call. */
export function tryResumeActiveMultiplayerGame() {
  const active = loadActiveRoom();
  if (!active) return;
  const s = connect();
  s.emit("rejoin-room", { code: active.code, playerIndex: active.playerIndex, userId: currentUser()?.id }, (res) => {
    if (!res?.ok) {
      clearActiveRoom();
      return;
    }
    // A successful rejoin's state-update (sent automatically by the server right after)
    // handles everything from here - normal board if the game's still going, showGameOver
    // if it already ended while this player was disconnected.
  });
}

function connect() {
  if (socket) return socket;
  socket = io("/multiplayer", { withCredentials: true });
  socket.on("state-update", ({ state, you: viewer }) => {
    latestState = state;
    you = viewer;
    showScreen("game-screen");
    render();
  });
  socket.on("choice-request", async (request, ack) => {
    const answer = await showChoice(enrichChoiceRequest(latestState, request));
    ack(answer);
  });
  socket.on("window-request", async ({ options, windowCtx }, ack) => {
    if (options.length === 0) return ack(null);
    const choiceOptions = options.map((o) => ({ cardId: o.cardId, label: `${getCard(o.cardId).name}${o.label !== "main" ? ` (${o.label})` : ""}`, value: o }));
    const chosen = await showChoice({
      type: "CHOOSE_EFFECT_SOURCE",
      prompt: "You may react with one of these cards, or pass.",
      options: choiceOptions,
      allowNone: true,
      ...windowThreatInfo(latestState, windowCtx),
    });
    ack(chosen || null);
  });
  socket.on("opponent-disconnected", () => toast("Your opponent disconnected."));
  socket.on("room-error", (msg) => toast("Room error: " + msg));
  return socket;
}

/** Used by the AFK-kick idle timer (app.js) - lets the server's existing "opponent
 * disconnected" handling award the win/end the room rather than leaving a live match
 * silently stuck waiting on a player who's gone. No-op if no multiplayer socket is open. */
export function disconnectMultiplayer() {
  socket?.disconnect();
  socket = null;
}

export function createMultiplayerRoom(deck, onCode) {
  gameOverShown = false;
  const s = connect();
  s.emit("create-room", { deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to create room.");
    saveActiveRoom(res.code, 0);
    onCode(res.code);
  });
}

export function joinMultiplayerRoom(code, deck, onJoined) {
  gameOverShown = false;
  const s = connect();
  s.emit("join-room", { code, deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to join room.");
    saveActiveRoom(code, 1);
    onJoined();
  });
}

function sendAction(action) {
  return new Promise((resolve) => connect().emit("game-action", action, resolve));
}

function render() {
  const container = document.getElementById("game-screen");
  container.innerHTML = "";
  const state = latestState;
  const me = you;

  const topbar = document.createElement("div");
  topbar.className = "game-topbar";
  const isMyTurn = state.activePlayerIndex === me;
  topbar.innerHTML = `<div>${isMyTurn ? "Your turn" : "Opponent's turn"} - Turn ${state.turnNumber}</div>`;
  const actions = document.createElement("div");
  actions.className = "topbar-actions";
  const concedeBtn = mkBtn("Concede", onConcede);
  concedeBtn.classList.add("secondary");
  concedeBtn.disabled = !isMyTurn;
  const endBtn = mkBtn("End Turn", () => sendAction({ type: "endTurn" }));
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
  if (isMyTurn && state.turnFlags.attacksAllowed) {
    state.players[me].playerSlots.forEach((inst) => {
      if (inst) attackable.add(inst.instanceId); // server re-validates on every action anyway
    });
  }
  if (armedSlot !== null) {
    const oppIndex = me === 0 ? 1 : 0;
    state.players[oppIndex].playerSlots.forEach((inst) => {
      if (inst) targetable.add(inst.instanceId);
    });
  }

  renderBoard(boardArea, state, me, {
    attackableInstanceIds: attackable,
    targetableInstanceIds: targetable,
    onCoachClick: (playerIndex, zone, cardId) => onCoachClick(playerIndex, zone, cardId, isMyTurn, me),
    onDiscardClick: showDiscardViewer,
    onHandCardClick: (handIndex, cardId) => onHandCardClick(handIndex, cardId, isMyTurn, me),
    onFieldCardClick: (playerIndex, slot, inst) => onFieldCardClick(playerIndex, slot, inst, isMyTurn, me),
  });

  if (state.gameOver && !gameOverShown) {
    gameOverShown = true;
    showGameOver(state, me);
  }
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
  await sendAction({ type: "concede" });
}

/** Clicking any hand card zooms in on it; a "Play" action appears only when actually legal
 * right now (correct trigger window for Events, normal play-legality for everything else) -
 * mirrors localMatch.js's client-side pre-check, with the server as the final word regardless. */
function onHandCardClick(handIndex, cardId, isMyTurn, me) {
  const card = getCard(cardId);
  const actions = [];
  if (isMyTurn) {
    if (card.type === "Event") {
      const sources = engine.getActivatableSources(latestState, me, "YOUR_TURN");
      const match = sources.find((s) => s.zone === "HAND" && s.handIndex === handIndex);
      if (match) {
        actions.push({ label: "Play", onClick: () => activateEffect(match, "YOUR_TURN") });
      }
    } else {
      const check = engine.canPlayCard(latestState, me, handIndex);
      if (check.ok) {
        actions.push({ label: "Play", onClick: () => playFieldCardFromHand(handIndex, cardId, card, me) });
      }
    }
  }
  showCardZoomWithActions(cardId, actions);
}

async function playFieldCardFromHand(handIndex, cardId, card, me) {
  const startEl = document.querySelector(`.hand-card .card-face[data-hand-index="${handIndex}"]`);
  const startRect = startEl?.getBoundingClientRect();

  let replaceSlot = null;
  if ((card.type === "Player" || card.type === "StarPlayer") && !latestState.players[me].playerSlots.some((s) => s === null)) {
    const chosen = await showChoice(
      enrichChoiceRequest(latestState, {
        type: "CHOOSE_OWN_PLAYER",
        prompt: "Your 3 player slots are full - replace which one?",
        options: latestState.players[me].playerSlots.map((s) => s.instanceId),
      })
    );
    replaceSlot = latestState.players[me].playerSlots.findIndex((s) => s.instanceId === chosen);
  }

  const result = await sendAction({ type: "playCard", handIndex, replaceSlot });
  if (!result?.ok) {
    toast(`Can't play that: ${result?.reason || "unknown error"}`);
    return;
  }
  if (result.instance && startRect) {
    await new Promise((r) => setTimeout(r, 60)); // let the state-update render land first
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

  if (armedSlot !== null && playerIndex === oppIndex) {
    const attackerInstanceId = latestState.players[me].playerSlots[armedSlot]?.instanceId;
    const capturedSlot = armedSlot;
    armedSlot = null;
    const result = await sendAction({ type: "attack", attackerSlot: capturedSlot, targetPlayerIndex: oppIndex, targetSlot: slot });
    if (!result?.ok) {
      toast(`Attack failed: ${result?.reason || "unknown error"}`);
      return;
    }
    const attackEvent = [...latestState.log].reverse().find((e) => e.type === "ATTACK" && e.attackerInstanceId === attackerInstanceId);
    const attackerEl = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`);
    const targetEl = attackEvent ? document.querySelector(`[data-instance-id="${attackEvent.targetInstanceId}"]`) : null;
    await animateAttackSwipe(attackerEl, targetEl);
    return;
  }

  if (armedSlot !== null && playerIndex === me && slot === armedSlot) {
    armedSlot = null;
    render();
    return;
  }

  const actions = [];
  if (isMyTurn && playerIndex === me) {
    if (engine.canAttackWith(latestState, me, slot)) {
      actions.push({ label: "Attack", onClick: () => { armedSlot = slot; render(); } });
    }
    const hasActivePsUp = latestState.players[me].psField.some((p) => p.isActive && !p.attachedTo);
    const canAttachPsUp = !inst.isStarPlayer || getStaticFlag(inst, "allowsNormalPsUpAttachment") === true;
    if (hasActivePsUp && canAttachPsUp) {
      actions.push({ label: "Attach PLAYERSCORE UP! (+1 Attack)", onClick: () => attachPsUpToField(me, inst.instanceId) });
    }
    const effectSources = [...engine.getActivatableSources(latestState, me, "YOUR_TURN"), ...engine.getActivatableSources(latestState, me, "SACRIFICE")].filter(
      (s) => s.instanceId === inst.instanceId
    );
    for (const src of effectSources) {
      actions.push({
        label: `Activate: ${getCard(src.cardId).name}${src.label !== "main" ? ` (${src.label})` : ""}`,
        onClick: () => activateEffect(src, src.effectDef.trigger),
      });
    }
  }
  showCardZoomWithActions(inst.cardId, actions);
}

async function attachPsUpToField(me, targetInstanceId) {
  const psUp = latestState.players[me].psField.find((p) => p.isActive && !p.attachedTo);
  if (!psUp) return;
  const result = await sendAction({ type: "attachPsUp", psUpId: psUp.id, targetInstanceId });
  if (!result?.ok) toast(`Can't attach: ${result?.reason || "unknown error"}`);
}

async function activateEffect(source, trigger) {
  const result = await sendAction({ type: "activateEffect", source, trigger });
  if (!result?.ok) toast(`Couldn't activate that: ${result?.reason || "unknown error"}`);
}

/** Head Coach / Assistant Coach click: zoom in, offering an activation action per
 * applicable effect (there's no attack/PS-UP action for coaches). */
function onCoachClick(playerIndex, zone, cardId, isMyTurn, me) {
  const actions = [];
  if (isMyTurn && playerIndex === me) {
    const sources = [...engine.getActivatableSources(latestState, me, "YOUR_TURN"), ...engine.getActivatableSources(latestState, me, "SACRIFICE")].filter((s) => s.zone === zone);
    for (const src of sources) {
      actions.push({ label: `Activate: ${getCard(src.cardId).name}`, onClick: () => activateEffect(src, src.effectDef.trigger) });
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
  const discard = latestState.players[playerIndex].discard;
  panel.innerHTML = `<div style="font-weight:800;color:var(--bbl-blue);">Discard Pile (${discard.length} cards, most recent first)</div>`;
  const grid = document.createElement("div");
  grid.className = "discard-viewer-grid";
  [...discard].reverse().forEach((cardId) => {
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

function showGameOver(state, me) {
  clearActiveRoom();
  const youWon = state.winner === me;
  reportGameResult(youWon ? "win" : "loss").catch(() => {});
  const overlay = document.createElement("div");
  overlay.className = "card-zoom-overlay";
  overlay.innerHTML = `
    <div class="bbl-panel" style="padding:32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:800;color:${youWon ? "var(--bbl-blue)" : "var(--bbl-red)"};">${youWon ? "You win!" : "You lose!"}</div>
      <button class="bbl-btn" style="margin-top:16px;" onclick="location.reload()">Back to Menu</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
