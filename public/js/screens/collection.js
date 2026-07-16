import { el, showScreen } from "../screens.js";
import { allCards } from "/shared/engine/cardDb.js";
import { getCollection } from "../api.js";
import { toast } from "../ui.js";
import { showCardZoomWithActions } from "../game/cardZoom.js";

export async function renderCollection() {
  const root = document.getElementById("collection-screen");
  root.innerHTML = "";
  root.className = "screen deckbuilder-screen";
  root.appendChild(el("div", { style: "padding:12px;text-align:center;color:var(--bbl-blue);font-weight:700;" }, "Loading your collection..."));

  let collection;
  try {
    collection = await getCollection();
  } catch (err) {
    toast("Couldn't load your collection: " + err.message);
    collection = {};
  }

  root.innerHTML = "";
  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "← Menu"),
    el("span", { style: "font-weight:800;" }, `Your Collection (${Object.values(collection).reduce((a, b) => a + b, 0)} cards)`),
  ]);
  root.appendChild(topbar);

  const grid = el("div", { class: "db-pool" });
  const owned = allCards().filter((c) => collection[c.id] > 0);
  if (owned.length === 0) {
    grid.appendChild(el("div", { style: "padding:20px;" }, "You don't own any cards yet - open a pack or start with the starter decks!"));
  }
  for (const card of owned) {
    grid.appendChild(
      el("div", { class: "db-card-tile", onclick: () => showCardZoomWithActions(card.id, []) }, [
        el("img", { src: `/${card.image}`, alt: card.name }),
        el("div", { class: "bbl-badge qty-badge" }, String(collection[card.id])),
      ])
    );
  }
  root.appendChild(grid);
}
