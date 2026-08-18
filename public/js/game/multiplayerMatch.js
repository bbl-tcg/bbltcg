import { getCard } from "/shared/engine/cardDb.js";
import * as engine from "/shared/engine/engine.js";
import { getStaticFlag } from "/shared/engine/stats.js";
import { renderBoard, cardImg } from "./render.js";
import { showChoice } from "./choiceModal.js";
import { showCardZoomWithActions } from "./cardZoom.js";
import { enrichChoiceRequest, windowThreatInfo } from "./choiceEnrich.js";
import { animateAttackSwipe, animateCardMove } from "./animations.js";
import { toast, confirmDialog } from "../ui.js";
import { currentUser } from "../api.js";
import { showScreen } from "../screens.js";
import { resetChat, addChatMessage, renderChatWidget } from "../chatWidget.js";

let socket = null;
let latestState = null;
let latestPlaymats = [null, null];
let you = null;
let armedSlot = null;
let gameOverShown = false;
let turnTimerInterval = null;

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
  socket.on("state-update", ({ state, you: viewer, playmats }) => {
    latestState = state;
    you = viewer;
    if (playmats) latestPlaymats = playmats;
    showScreen("game-screen");
    render();
  });
  // The room-creator's socket has no other signal that their opponent has actually shown
  // up: the server doesn't broadcastState() until the whole setup flow (mulligan, first/
  // second pick, opening card) finishes, and this player isn't necessarily the one being
  // asked anything first. Without this, they'd sit on the stale "waiting for them to
  // join..." room-setup screen for that entire stretch even though the match is already
  // under way. The joiner instead gets this same waiting screen the moment their own
  // join-room call succeeds - see joinMultiplayerRoom below.
  socket.on("opponent-joined", () => {
    showScreen("game-screen");
    renderWaitingForOpponent();
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
  socket.on("peer-deciding", setPeerDeciding);
  socket.on("opponent-disconnected", () => toast("Your opponent disconnected."));
  socket.on("room-error", (msg) => toast("Room error: " + msg));
  socket.on("chat-message", ({ text }) => {
    addChatMessage("them", text);
    if (latestState) render();
  });
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
  resetChat();
  const s = connect();
  s.emit("create-room", { deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to create room.");
    saveActiveRoom(res.code, 0);
    onCode(res.code);
  });
}

/** Lets the room creator swap their deck while still on the "waiting for opponent to
 * join" screen - the server only accepts this before runSetup() has actually used the
 * deck (see the "update-deck" handler in server/multiplayer.js), so it's a no-op once the
 * opponent has joined and the match is already under way. */
export function updateRoomDeck(deck, onResult) {
  connect().emit("update-deck", { deck }, (res) => onResult(res.ok, res.reason));
}

export function joinMultiplayerRoom(code, deck, onJoined) {
  gameOverShown = false;
  resetChat();
  const s = connect();
  s.emit("join-room", { code, deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to join room.");
    saveActiveRoom(code, 1);
    // Setup (mulligan, first/second pick, opening card) runs on the server before the
    // first real state-update - render a placeholder now rather than leave #game-screen
    // blank for that whole stretch (the game-screen div has no content of its own yet).
    showScreen("game-screen");
    renderWaitingForOpponent();
    onJoined();
  });
}

function sendAction(action) {
  return new Promise((resolve) => connect().emit("game-action", action, resolve));
}

/** Shown on #game-screen for whichever player isn't the one currently being asked a
 * mulligan/first-pick/opening-card question during pre-game setup - see the "opponent-
 * joined" socket handler and joinMultiplayerRoom above. Stays up underneath this player's
 * own choice-request/window-request modals too (those are just an overlay on top, so
 * nothing needs to re-show it after each one closes) until the real board takes over at
 * the first state-update. */
function renderWaitingForOpponent() {
  const container = document.getElementById("game-screen");
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "flex:1 1 auto;display:flex;align-items:center;justify-content:center;";
  const panel = document.createElement("div");
  panel.className = "bbl-panel";
  panel.style.cssText = "padding:32px;text-align:center;font-weight:700;color:var(--bbl-blue);font-size:1.1rem;";
  panel.textContent = "Waiting for opponent...";
  wrap.appendChild(panel);
  container.appendChild(wrap);
}

// A full-screen blocking overlay shown while the OTHER player is answering a choice/window
// request (their own turn effect, or a reactive one like Sainz's discard-to-negate) - without
// this, nothing stopped this player from immediately attacking again with another card while
// their first attack's reactive window was still awaiting the opponent, sending a second
// choice-request before the first had answered and stacking overlays out of order on both
// sides. Reuses .choice-overlay/.choice-panel so it looks consistent with every other choice
// prompt; has no buttons since there's nothing for this player to do but wait.
let peerDecidingOverlay = null;
function setPeerDeciding(isDeciding) {
  if (isDeciding) {
    if (peerDecidingOverlay) return;
    peerDecidingOverlay = document.createElement("div");
    peerDecidingOverlay.className = "choice-overlay";
    const panel = document.createElement("div");
    panel.className = "choice-panel bbl-panel";
    panel.style.cssText = "text-align:center;font-weight:800;color:var(--bbl-blue);font-size:1.05rem;";
    panel.textContent = "Waiting for your opponent to make a decision...";
    peerDecidingOverlay.appendChild(panel);
    document.body.appendChild(peerDecidingOverlay);
  } else {
    peerDecidingOverlay?.remove();
    peerDecidingOverlay = null;
  }
}

function render() {
  const container = document.getElementById("game-screen");
  container.innerHTML = "";
  const state = latestState;
  const me = you;

  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }

  const topbar = document.createElement("div");
  topbar.className = "game-topbar";
  const isMyTurn = state.activePlayerIndex === me;
  topbar.innerHTML = `<div>${isMyTurn ? "Your turn" : "Opponent's turn"} - Turn ${state.turnNumber}</div>`;
  if (state.turnDeadline && !state.gameOver) {
    const timerEl = document.createElement("div");
    timerEl.className = "turn-timer";
    const updateTimer = () => {
      const remainingSecs = Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000));
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
    const attackerInst = state.players[me].playerSlots[armedSlot];
    state.players[oppIndex].playerSlots.forEach((inst, slot) => {
      // Skip targets immune to THIS specific attacker (e.g. Ricky Covey Jr.'s "cannot be
      // attacked by players with a Cost of N or less") - without this, an immune target was
      // still shown as a valid attack target, only to have the attack silently rejected by
      // the server after clicking it.
      if (inst && !engine.isAttackBlocked(state, oppIndex, slot, attackerInst)) targetable.add(inst.instanceId);
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
  applyPlaymats(boardArea, me);

  container.appendChild(
    renderChatWidget((text) => {
      addChatMessage("me", text);
      connect().emit("chat-message", { text });
      render();
    })
  );

  if (state.gameOver && !gameOverShown) {
    gameOverShown = true;
    showGameOver(state, me);
  }
}

/** Sets each side's field background from its deck's saved playmat (see deckbuilder.js) -
 * applied here rather than threaded through renderBoard()'s own signature, since only the
 * caller knows which playmat belongs to which visible side. `latestPlaymats` arrives
 * alongside `state` in every state-update (see connect() above), indexed by player index
 * (not "you"/opponent), same as `state.players[]` itself. No-op (falls back to the default
 * CSS background) for a side with no playmat set. */
function applyPlaymats(boardArea, viewerIndex) {
  const opponentIndex = viewerIndex === 0 ? 1 : 0;
  const opponentBg = boardArea.querySelector(".opponent-area .playmat-bg");
  const playerBg = boardArea.querySelector(".player-area .playmat-bg");
  if (opponentBg) opponentBg.style.backgroundImage = latestPlaymats[opponentIndex] ? `url(${latestPlaymats[opponentIndex]})` : "";
  if (playerBg) playerBg.style.backgroundImage = latestPlaymats[viewerIndex] ? `url(${latestPlaymats[viewerIndex]})` : "";
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
        allowNone: true,
        cancelLabel: "Don't play this card",
      })
    );
    if (!chosen) return; // cancelled - card stays in hand, nothing paid
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
  setPeerDeciding(false); // clear a stuck overlay if the game ended while it was still showing (e.g. opponent disconnected mid-decision)
  const youWon = state.winner === me;
  // Unlike localMatch.js's vsBot games (no server-authoritative state to hook a result
  // into, so the client self-reports via reportGameResult), a multiplayer result is
  // already awarded server-side by the room itself (see awardResults() in
  // server/multiplayer.js), including the concede/disconnect/timeout -> 0 Pack Points
  // distinction - self-reporting here too would silently double-award every result.
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
