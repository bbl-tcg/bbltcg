import { el, showScreen } from "../screens.js";
import { allCards, getCard } from "/shared/engine/cardDb.js";
import { validateDeck } from "/shared/engine/deckLegality.js";
import { MAX_COPIES_PER_NAME, MAIN_DECK_SIZE } from "/shared/engine/constants.js";
import { loadCustomDecks, saveCustomDeck, deleteCustomDeck } from "../storage.js";
import { toast, confirmDialog } from "../ui.js";

let deck = null; // { name, headCoachId, mainDeck: string[] }
let filterText = "";

function headCoaches() {
  return allCards().filter((c) => c.type === "HeadCoach");
}

function newDeck(headCoachId) {
  return { name: "New Deck", headCoachId, mainDeck: [] };
}

export function renderDeckbuilder() {
  const root = document.getElementById("deckbuilder-screen");
  root.innerHTML = "";
  root.className = "screen deckbuilder-screen";

  if (!deck) deck = newDeck(headCoaches()[0]?.id);

  root.appendChild(renderTopbar());
  const body = el("div", { class: "db-body" });
  body.appendChild(renderPool());
  body.appendChild(renderDeckPanel());
  root.appendChild(body);
}

function renderTopbar() {
  const hcSelect = el(
    "select",
    {
      onchange: (e) => {
        deck = newDeck(e.target.value);
        renderDeckbuilder();
      },
    },
    headCoaches().map((hc) => el("option", { value: hc.id, selected: hc.id === deck.headCoachId ? "selected" : undefined }, `${hc.name} (${hc.months.join("/")})`))
  );

  const nameInput = el("input", {
    type: "text",
    value: deck.name,
    placeholder: "Deck name",
    oninput: (e) => {
      deck.name = e.target.value;
    },
  });

  const filterInput = el("input", {
    type: "text",
    placeholder: "Search cards...",
    value: filterText,
    oninput: (e) => {
      filterText = e.target.value;
      renderDeckbuilder();
    },
  });

  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "← Menu"),
    el("span", { style: "font-weight:800;" }, "Head Coach:"),
    hcSelect,
    nameInput,
    filterInput,
    el("button", { class: "bbl-btn", onclick: onSaveDeck }, "Save Deck"),
    el("button", { class: "bbl-btn secondary", onclick: onClearDeck }, "Clear"),
  ]);
  return topbar;
}

function onSaveDeck() {
  const result = validateDeck({ headCoachId: deck.headCoachId, mainDeck: deck.mainDeck, psDeckCount: 5 });
  saveCustomDeck({ ...deck });
  toast(result.legal ? `"${deck.name}" saved!` : `"${deck.name}" saved as a draft (not yet legal - see the status panel).`);
  renderDeckbuilder();
}

async function onClearDeck() {
  if (!(await confirmDialog("Clear the current deck?"))) return;
  deck = newDeck(deck.headCoachId);
  renderDeckbuilder();
}

function eligibleCards() {
  const hc = getCard(deck.headCoachId);
  const hcMonths = new Set(hc.months || []);
  return allCards().filter((c) => {
    if (!["Player", "StarPlayer", "AssistantCoach", "Event"].includes(c.type)) return false;
    if (c.type !== "Event" && !(c.months || []).some((m) => hcMonths.has(m))) return false;
    if (filterText && !c.name.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });
}

function countInDeck(name) {
  return deck.mainDeck.filter((id) => getCard(id).name === name).length;
}

function renderPool() {
  const pool = el("div", { class: "db-pool" });
  for (const card of eligibleCards()) {
    const count = countInDeck(card.name);
    const tile = el("div", { class: "db-card-tile", onclick: () => addCard(card) }, [
      el("img", { src: `/${card.image}`, alt: card.name }),
      ...(count > 0 ? [el("div", { class: "bbl-badge qty-badge" }, String(count))] : []),
    ]);
    pool.appendChild(tile);
  }
  return pool;
}

function addCard(card) {
  if (deck.mainDeck.length >= MAIN_DECK_SIZE) {
    toast(`Your deck already has ${MAIN_DECK_SIZE} cards.`);
    return;
  }
  if (countInDeck(card.name) >= MAX_COPIES_PER_NAME) {
    toast(`You already have the maximum ${MAX_COPIES_PER_NAME} copies of "${card.name}".`);
    return;
  }
  deck.mainDeck.push(card.id);
  renderDeckbuilder();
}

function removeCard(cardId) {
  const idx = deck.mainDeck.indexOf(cardId);
  if (idx !== -1) deck.mainDeck.splice(idx, 1);
  renderDeckbuilder();
}

function renderDeckPanel() {
  const panel = el("div", { class: "db-deck-panel" });
  const result = validateDeck({ headCoachId: deck.headCoachId, mainDeck: deck.mainDeck, psDeckCount: 5 });

  panel.appendChild(el("div", { style: "font-weight:800;color:var(--bbl-blue);" }, `${deck.mainDeck.length} / ${MAIN_DECK_SIZE} cards + 1 Head Coach + 5 PLAYERSCORE UP!`));

  const status = el(
    "div",
    { class: `db-status ${result.legal ? "legal" : "illegal"}` },
    result.legal ? "Legal deck ✓" : el("div", {}, [el("div", {}, "Not legal yet:"), el("ul", {}, result.errors.map((e) => el("li", {}, e)))])
  );
  panel.appendChild(status);

  // Group by name for a compact list.
  const grouped = new Map();
  for (const id of deck.mainDeck) {
    const card = getCard(id);
    const existing = grouped.get(card.name);
    grouped.set(card.name, { card, id, count: (existing?.count || 0) + 1 });
  }
  const list = el(
    "div",
    { class: "db-deck-list" },
    [...grouped.values()].map((g) =>
      el("div", { class: "db-deck-row" }, [
        el("span", {}, `${g.card.name} x${g.count}`),
        el("button", { class: "bbl-btn secondary", style: "padding:2px 8px;font-size:0.75rem;", onclick: () => removeCard(g.id) }, "-1"),
      ])
    )
  );
  panel.appendChild(el("div", { style: "font-weight:700;" }, "Deck List"));
  panel.appendChild(list);

  panel.appendChild(el("div", { style: "font-weight:700;margin-top:8px;" }, "Your Saved Decks"));
  const saved = el(
    "div",
    { class: "db-saved-decks" },
    loadCustomDecks().map((d) =>
      el("div", { class: "db-deck-row" }, [
        el("span", { style: "cursor:pointer;", onclick: () => { deck = { ...d }; renderDeckbuilder(); } }, d.name),
        el("button", { class: "bbl-btn secondary", style: "padding:2px 8px;font-size:0.75rem;", onclick: () => { deleteCustomDeck(d.name); renderDeckbuilder(); } }, "Delete"),
      ])
    )
  );
  panel.appendChild(saved);

  return panel;
}
