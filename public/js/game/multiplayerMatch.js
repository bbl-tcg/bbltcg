import { getCard } from "/shared/engine/cardDb.js";
import { renderBoard, cardImg } from "./render.js";
import { showChoice } from "./choiceModal.js";
import { animateAttackSwipe, animateCardMove } from "./animations.js";
import { toast } from "../ui.js";
import { currentUser, reportGameResult } from "../api.js";
import { showScreen } from "../screens.js";

let socket = null;
let latestState = null;
let you = null;
let armedSlot = null;
let gameOverShown = false;

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
    const answer = await showChoice(request);
    ack(answer);
  });
  socket.on("window-request", async ({ options, windowCtx }, ack) => {
    if (options.length === 0) return ack(null);
    const choiceOptions = options.map((o) => ({ cardId: o.cardId, label: `${getCard(o.cardId).name}${o.label !== "main" ? ` (${o.label})` : ""}`, value: o }));
    const chosen = await showChoice({ type: "CHOOSE_EFFECT_SOURCE", prompt: "You may react with one of these cards, or pass.", options: choiceOptions, allowNone: true });
    ack(chosen || null);
  });
  socket.on("opponent-disconnected", () => toast("Your opponent disconnected."));
  socket.on("room-error", (msg) => toast("Room error: " + msg));
  return socket;
}

export function createMultiplayerRoom(deck, onCode) {
  gameOverShown = false;
  const s = connect();
  s.emit("create-room", { deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to create room.");
    onCode(res.code);
  });
}

export function joinMultiplayerRoom(code, deck, onJoined) {
  gameOverShown = false;
  const s = connect();
  s.emit("join-room", { code, deck, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason || "Failed to join room.");
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
  topbar.innerHTML = `<div>${isMyTurn ? "Your turn" : "Opponent's turn"} - Turn ${state.turnNumber}</div><div class="phase-pill">${state.phase}</div>`;
  const actions = document.createElement("div");
  actions.className = "topbar-actions";
  const effectsBtn = mkBtn("Effects", showEffectsPanel);
  const endBtn = mkBtn("End Turn", () => sendAction({ type: "endTurn" }));
  effectsBtn.disabled = !isMyTurn;
  endBtn.disabled = !isMyTurn;
  actions.appendChild(effectsBtn);
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
    onZoom: showZoom,
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

async function onHandCardClick(handIndex, cardId, isMyTurn, me) {
  if (!isMyTurn) return;
  const card = getCard(cardId);
  const startEl = document.querySelector(`.hand-card .card-face[data-hand-index="${handIndex}"]`);
  const startRect = startEl?.getBoundingClientRect();

  let replaceSlot = null;
  if ((card.type === "Player" || card.type === "StarPlayer") && !latestState.players[me].playerSlots.some((s) => s === null)) {
    const chosen = await showChoice({
      type: "CHOOSE_OWN_PLAYER",
      prompt: "Your 3 player slots are full - replace which one?",
      options: latestState.players[me].playerSlots.map((s) => s.instanceId),
    });
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
  if (!isMyTurn || !inst) return;
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

  if (playerIndex === me) {
    armedSlot = slot;
    render();
  }
}

async function showEffectsPanel() {
  // The server is authoritative on what's actually activatable; this just offers the
  // player's own field/coach cards (excluding hand Events, which use their own trigger
  // window automatically) as candidates and lets the server validate/reject.
  const me = you;
  const player = latestState.players[me];
  const candidates = [];
  if (player.headCoach) candidates.push({ cardId: player.headCoach.cardId, zone: "HEAD_COACH", instanceId: null, label: "main" });
  if (player.assistantCoach) candidates.push({ cardId: player.assistantCoach.cardId, zone: "ASSISTANT_COACH", instanceId: null, label: "main" });
  player.playerSlots.forEach((inst) => {
    if (inst) candidates.push({ cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, label: "main" });
  });
  if (candidates.length === 0) {
    toast("No cards on your field/coaches to activate.");
    return;
  }
  const options = candidates.map((s) => ({ cardId: s.cardId, label: getCard(s.cardId).name, value: s }));
  const chosen = await showChoice({ type: "CHOOSE_EFFECT_SOURCE", prompt: "Try to activate which card's effect?", options, allowNone: true });
  if (!chosen) return;
  for (const trigger of ["YOUR_TURN", "SACRIFICE"]) {
    const result = await sendAction({ type: "activateEffect", source: chosen, trigger });
    if (result?.ok) return;
  }
  toast("That card has no activatable effect right now.");
}

function showZoom(cardId) {
  const overlay = document.createElement("div");
  overlay.className = "card-zoom-overlay";
  overlay.onclick = () => overlay.remove();
  const img = document.createElement("img");
  img.src = cardImg(cardId);
  overlay.appendChild(img);
  document.body.appendChild(overlay);
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
    grid.appendChild(img);
  });
  panel.appendChild(grid);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function showGameOver(state, me) {
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
