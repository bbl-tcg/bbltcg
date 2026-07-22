import { el, showScreen } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { getCollection, currentUser } from "../api.js";
import { toast } from "../ui.js";
import { showCardZoomWithActions } from "../game/cardZoom.js";
import { renderMenu } from "./menu.js";
import { resetChat, addChatMessage, renderChatWidget } from "../chatWidget.js";
import { nameWithRarity } from "../cardDisplay.js";

let socket = null;
let myCollection = {};
let mySelection = [];
let theirSelection = [];
let mySubmitted = false;
let theirSubmitted = false;

function connect() {
  if (socket) return socket;
  socket = io("/trade", { withCredentials: true });
  socket.on("trade-update", (data) => {
    theirSelection = data.theirSelection;
    mySubmitted = data.yourSubmitted;
    theirSubmitted = data.theirSubmitted;
    renderBody();
  });
  socket.on("trade-complete", (data) => {
    if (data.ok) {
      toast("Trade complete! Cards have been swapped.");
    } else {
      toast("Trade failed: " + data.reason);
    }
    renderMenu();
    showScreen("menu-screen");
  });
  socket.on("opponent-disconnected", () => toast("Your trade partner disconnected."));
  socket.on("chat-message", ({ text }) => {
    addChatMessage("them", text);
    renderBody();
  });
  return socket;
}

export async function renderTrade() {
  const root = document.getElementById("trade-screen");
  root.innerHTML = "";
  root.className = "screen deckbuilder-screen";
  mySelection = [];
  theirSelection = [];
  mySubmitted = false;
  theirSubmitted = false;
  resetChat();

  try {
    myCollection = await getCollection();
  } catch (err) {
    toast("Couldn't load your collection: " + err.message);
    myCollection = {};
  }
  renderBody();
}

function renderBody() {
  const root = document.getElementById("trade-screen");
  // Adding/removing a card from either offer re-renders this whole screen (root.innerHTML
  // = "" below tears down and rebuilds the DOM), which would otherwise silently reset
  // scroll position back to the top on every single click - preserve it across the
  // rebuild, same as deckbuilder.js's renderAll() already does. .db-pool/.db-deck-panel
  // scroll independently at desktop widths, but under deckbuilder.css's mobile breakpoint
  // they don't (only the shared .db-body wrapper does) - save/restore all three so this
  // works at both sizes; restoring a scrollTop on a not-actually-scrollable element is a
  // harmless no-op.
  const prevPoolScrollTop = root.querySelector(".db-pool")?.scrollTop ?? 0;
  const prevDeckPanelScrollTop = root.querySelector(".db-deck-panel")?.scrollTop ?? 0;
  const prevBodyScrollTop = root.querySelector(".db-body")?.scrollTop ?? 0;
  root.innerHTML = "";

  const codeInput = el("input", { type: "text", placeholder: "Invite code", maxlength: "6", style: "padding:6px;border-radius:6px;border:2px solid var(--bbl-black);" });
  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"),
    el("button", { class: "bbl-btn", onclick: onCreateTrade }, "Create Trade"),
    codeInput,
    el("button", { class: "bbl-btn secondary", onclick: () => onJoinTrade(codeInput.value.trim().toUpperCase()) }, "Join Trade"),
    el("span", { style: "font-weight:800;" }, "Your Offer:"),
    el("span", {}, mySelection.length ? mySelection.map((id) => nameWithRarity(getCard(id))).join(", ") : "(nothing selected)"),
    el("button", { class: "bbl-btn", onclick: onSubmit, disabled: mySelection.length === 0 || mySubmitted ? "disabled" : undefined }, mySubmitted ? "Submitted ✓" : "Submit Trade"),
  ]);
  root.appendChild(topbar);

  const body = el("div", { class: "db-body" });

  const myPool = el("div", { class: "db-pool" });
  const ownedCardIds = Object.keys(myCollection)
    .filter((id) => myCollection[id] > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  myPool.appendChild(el("div", { style: "grid-column:1/-1;font-weight:800;color:var(--bbl-blue);" }, "Your Collection (click to offer)"));
  for (const cardId of ownedCardIds) {
    const card = getCard(cardId);
    const selectedCount = mySelection.filter((id) => id === cardId).length;
    myPool.appendChild(
      el(
        "div",
        {
          class: "db-card-tile",
          onclick: () => {
            if (mySubmitted) return;
            if (selectedCount >= myCollection[cardId]) return toast("You don't own any more copies of that card.");
            mySelection.push(cardId);
            broadcastSelection();
          },
        },
        [
          el("img", { src: `/${card.image}`, alt: card.name }),
          el("div", { class: "bbl-badge owned-badge", title: "Copies you own" }, `x${myCollection[cardId]}`),
          ...(selectedCount ? [el("div", { class: "bbl-badge qty-badge" }, String(selectedCount))] : []),
          el("button", { class: "zoom-btn", title: "Zoom in", onclick: (e) => { e.stopPropagation(); showCardZoomWithActions(cardId, []); } }, "🔍"),
        ]
      )
    );
  }
  body.appendChild(myPool);

  const previewPanel = el("div", { class: "db-deck-panel" });
  previewPanel.appendChild(el("div", { style: "font-weight:800;" }, "Their Offer" + (theirSubmitted ? " (submitted ✓)" : "")));
  const previewList = el("div", { class: "db-deck-list" });
  if (theirSelection.length === 0) previewList.appendChild(el("div", {}, "(nothing selected yet)"));
  for (const cardId of theirSelection) {
    previewList.appendChild(el("div", { class: "db-deck-row" }, [el("span", {}, nameWithRarity(getCard(cardId)))]));
  }
  previewPanel.appendChild(previewList);

  previewPanel.appendChild(el("div", { style: "font-weight:800;margin-top:10px;" }, "Your Offer"));
  const myList = el("div", { class: "db-deck-list" });
  if (mySelection.length === 0) myList.appendChild(el("div", {}, "(nothing selected yet)"));
  mySelection.forEach((cardId, i) => {
    myList.appendChild(
      el("div", { class: "db-deck-row" }, [
        el("span", {}, nameWithRarity(getCard(cardId))),
        el(
          "button",
          {
            class: "bbl-btn secondary",
            style: "padding:2px 8px;font-size:0.75rem;",
            onclick: () => {
              if (mySubmitted) return;
              mySelection.splice(i, 1);
              broadcastSelection();
            },
          },
          "Remove"
        ),
      ])
    );
  });
  previewPanel.appendChild(myList);
  body.appendChild(previewPanel);

  root.appendChild(body);
  root.appendChild(
    renderChatWidget((text) => {
      addChatMessage("me", text);
      connect().emit("chat-message", { text });
      renderBody();
    })
  );

  const pool = root.querySelector(".db-pool");
  if (pool) pool.scrollTop = prevPoolScrollTop;
  const deckPanel = root.querySelector(".db-deck-panel");
  if (deckPanel) deckPanel.scrollTop = prevDeckPanelScrollTop;
  const bodyEl = root.querySelector(".db-body");
  if (bodyEl) bodyEl.scrollTop = prevBodyScrollTop;
}

function broadcastSelection() {
  connect().emit("update-selection", { cardIds: mySelection });
  mySubmitted = false;
  renderBody();
}

function onCreateTrade() {
  connect().emit("create-trade", { userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason);
    // Longer than the default 3.2s - the player needs time to actually read/copy/share the
    // code with their trade partner before it disappears.
    toast(`Trade invite code: ${res.code} - share it with your trade partner.`, 18200);
  });
}

function onJoinTrade(code) {
  if (code.length !== 6) return toast("Enter the 6-character invite code.");
  connect().emit("join-trade", { code, userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason);
    toast("Joined the trade!");
  });
}

function onSubmit() {
  if (mySelection.length === 0) return;
  connect().emit("submit-trade", {}, () => {
    mySubmitted = true;
    renderBody();
  });
}
