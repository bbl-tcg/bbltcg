import { el, showScreen } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { getCollection, currentUser } from "../api.js";
import { toast } from "../ui.js";

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
    showScreen("menu-screen");
  });
  socket.on("opponent-disconnected", () => toast("Your trade partner disconnected."));
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
  root.innerHTML = "";

  const codeInput = el("input", { type: "text", placeholder: "Invite code", maxlength: "6", style: "padding:6px;border-radius:6px;border:2px solid var(--bbl-black);" });
  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "← Menu"),
    el("button", { class: "bbl-btn", onclick: onCreateTrade }, "Create Trade"),
    codeInput,
    el("button", { class: "bbl-btn secondary", onclick: () => onJoinTrade(codeInput.value.trim().toUpperCase()) }, "Join Trade"),
    el("span", { style: "font-weight:800;" }, "Your Offer:"),
    el("span", {}, mySelection.length ? mySelection.map((id) => getCard(id).name).join(", ") : "(nothing selected)"),
    el("button", { class: "bbl-btn", onclick: onSubmit, disabled: mySelection.length === 0 || mySubmitted ? "disabled" : undefined }, mySubmitted ? "Submitted ✓" : "Submit Trade"),
  ]);
  root.appendChild(topbar);

  const body = el("div", { class: "db-body" });

  const myPool = el("div", { class: "db-pool" });
  const ownedCardIds = Object.keys(myCollection).filter((id) => myCollection[id] > 0);
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
        [el("img", { src: `/${card.image}`, alt: card.name }), ...(selectedCount ? [el("div", { class: "bbl-badge qty-badge" }, String(selectedCount))] : [])]
      )
    );
  }
  body.appendChild(myPool);

  const previewPanel = el("div", { class: "db-deck-panel" });
  previewPanel.appendChild(el("div", { style: "font-weight:800;" }, "Their Offer" + (theirSubmitted ? " (submitted ✓)" : "")));
  const previewList = el("div", { class: "db-deck-list" });
  if (theirSelection.length === 0) previewList.appendChild(el("div", {}, "(nothing selected yet)"));
  for (const cardId of theirSelection) {
    previewList.appendChild(el("div", { class: "db-deck-row" }, [el("span", {}, getCard(cardId).name)]));
  }
  previewPanel.appendChild(previewList);

  previewPanel.appendChild(el("div", { style: "font-weight:800;margin-top:10px;" }, "Your Offer"));
  const myList = el("div", { class: "db-deck-list" });
  if (mySelection.length === 0) myList.appendChild(el("div", {}, "(nothing selected yet)"));
  mySelection.forEach((cardId, i) => {
    myList.appendChild(
      el("div", { class: "db-deck-row" }, [
        el("span", {}, getCard(cardId).name),
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
}

function broadcastSelection() {
  connect().emit("update-selection", { cardIds: mySelection });
  mySubmitted = false;
  renderBody();
}

function onCreateTrade() {
  connect().emit("create-trade", { userId: currentUser()?.id }, (res) => {
    if (!res.ok) return toast(res.reason);
    toast(`Trade invite code: ${res.code} - share it with your trade partner.`);
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
