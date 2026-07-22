import { el, showScreen } from "../screens.js";
import { allCards, getCard } from "/shared/engine/cardDb.js";
import { validateDeck } from "/shared/engine/deckLegality.js";
import { MAX_COPIES_PER_NAME, MAIN_DECK_SIZE, PS_DECK_SIZE } from "/shared/engine/constants.js";
import { loadCustomDecks, saveCustomDeck, deleteCustomDeck, loadCollection } from "../storage.js";
import { toast, confirmDialog } from "../ui.js";
import { isLoggedIn, listServerDecks, saveServerDeck, deleteServerDeck, getCollection } from "../api.js";
import { showCardZoomWithActions } from "../game/cardZoom.js";
import { openPlaymatEditor } from "./playmatEditor.js";
import { renderMenu } from "./menu.js";
import { nameWithRarity } from "../cardDisplay.js";

let deck = null; // { id?, name, headCoachId, mainDeck: string[], playmatUrl: string|null }
let filterText = "";
let savedDecksCache = [];
let collectionCache = {}; // { [cardId]: quantityOwned }
// Collapsed by default so the in-progress deck list (the thing actively being edited) gets
// the visible space; the saved-decks list is opened on demand instead.
let savedDecksExpanded = false;

/** Only Head Coaches actually in the account's/browser's collection - a Head Coach with
 * 0 copies owned isn't a legal deck foundation, so it shouldn't be offered as one. */
function headCoaches() {
  return allCards().filter((c) => c.type === "HeadCoach" && ownedQty(c.id) > 0);
}

function newDeck(headCoachId) {
  return { name: "New Deck", headCoachId, mainDeck: [], playmatUrl: null };
}

/** Server-backed decks when logged in (synced across devices); localStorage otherwise. */
async function loadSavedDecks() {
  if (isLoggedIn()) return listServerDecks();
  return loadCustomDecks();
}

async function persistDeck(d) {
  if (isLoggedIn()) return saveServerDeck(d);
  saveCustomDeck(d);
}

async function removeSavedDeck(d) {
  if (isLoggedIn()) return deleteServerDeck(d.id);
  deleteCustomDeck(d.name);
}

/** Server-backed collection when logged in; this browser's localStorage otherwise. */
async function loadCollectionData() {
  if (isLoggedIn()) return getCollection();
  return loadCollection();
}

function ownedQty(cardId) {
  return collectionCache[cardId] || 0;
}

export async function renderDeckbuilder() {
  const root = document.getElementById("deckbuilder-screen");
  root.className = "screen deckbuilder-screen";
  // headCoaches() now depends on the collection, so it must load *before* picking a
  // default deck - deriving it first (as this used to) would always see an empty
  // collectionCache and could wedge `deck` on an undefined Head Coach forever, since the
  // `if (!deck)` guard below only ever runs this once.
  [savedDecksCache, collectionCache] = await Promise.all([
    loadSavedDecks().catch(() => []),
    loadCollectionData().catch(() => ({})),
  ]);
  if (!deck) deck = newDeck(headCoaches()[0]?.id);
  renderAll();
}

function renderAll() {
  const root = document.getElementById("deckbuilder-screen");

  if (headCoaches().length === 0) {
    root.innerHTML = "";
    root.appendChild(
      el("div", { style: "padding:24px;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;" }, [
        el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"),
        el("div", { style: "font-weight:800;color:var(--bbl-blue);font-size:1.1rem;" }, "You don't own any Head Coaches yet"),
        el("div", {}, "Open a pack or start from one of the 4 starter decks to get one."),
      ])
    );
    return;
  }
  if (!deck || ownedQty(deck.headCoachId) <= 0) deck = newDeck(headCoaches()[0]?.id);

  const prevPoolScrollTop = root.querySelector(".db-pool")?.scrollTop ?? 0;
  const prevDeckPanelScrollTop = root.querySelector(".db-deck-panel")?.scrollTop ?? 0;
  root.innerHTML = "";

  root.appendChild(renderTopbar());
  const body = el("div", { class: "db-body" });
  body.appendChild(renderPool());
  body.appendChild(renderDeckPanel());
  root.appendChild(body);

  const pool = root.querySelector(".db-pool");
  if (pool) pool.scrollTop = prevPoolScrollTop;
  const deckPanel = root.querySelector(".db-deck-panel");
  if (deckPanel) deckPanel.scrollTop = prevDeckPanelScrollTop;
}

function renderTopbar() {
  const hcSelect = el(
    "select",
    {
      onchange: (e) => {
        deck = newDeck(e.target.value);
        renderAll();
      },
    },
    headCoaches().map((hc) => el("option", { value: hc.id, selected: hc.id === deck.headCoachId ? "selected" : undefined }, `${nameWithRarity(hc)} (${hc.months.join("/")})`))
  );

  const viewHeadCoachBtn = el(
    "button",
    { class: "bbl-btn ghost", onclick: () => showCardZoomWithActions(deck.headCoachId) },
    "View"
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
      renderAll();
    },
  });

  const playmatSwatch = el("div", { class: "playmat-preview-swatch", title: "Current playmat" });
  if (deck.playmatUrl) playmatSwatch.style.backgroundImage = `url(${deck.playmatUrl})`;

  const playmatControls = el("div", { style: "display:flex;align-items:center;gap:6px;" }, [
    playmatSwatch,
    el(
      "button",
      {
        class: "bbl-btn ghost",
        onclick: () => openPlaymatEditor((dataUrl) => { deck.playmatUrl = dataUrl; renderAll(); }),
      },
      deck.playmatUrl ? "Change Playmat" : "Set Playmat"
    ),
    ...(deck.playmatUrl
      ? [el("button", { class: "bbl-btn secondary", onclick: () => { deck.playmatUrl = null; renderAll(); } }, "Remove")]
      : []),
  ]);

  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"),
    el("span", { style: "font-weight:800;" }, "Head Coach:"),
    hcSelect,
    viewHeadCoachBtn,
    nameInput,
    filterInput,
    playmatControls,
    el("button", { class: "bbl-btn", onclick: onSaveDeck }, "Save Deck"),
    el("button", { class: "bbl-btn secondary", onclick: onClearDeck }, "Clear"),
    ...(isLoggedIn() ? [] : [el("span", { style: "color:var(--bbl-red);font-weight:700;font-size:0.85rem;" }, "Not logged in - decks save to this browser only")]),
  ]);
  return topbar;
}

async function onSaveDeck() {
  const result = validateDeck({ headCoachId: deck.headCoachId, mainDeck: deck.mainDeck, psDeckCount: PS_DECK_SIZE });
  try {
    await persistDeck(deck);
  } catch (err) {
    toast("Couldn't save: " + err.message);
    return;
  }
  toast(result.legal ? `"${deck.name}" saved!` : `"${deck.name}" saved as a draft (not yet legal - see the status panel).`);
  savedDecksCache = await loadSavedDecks().catch(() => []);
  renderAll();
}

async function onClearDeck() {
  if (!(await confirmDialog("Clear the current deck?"))) return;
  deck = newDeck(deck.headCoachId);
  renderAll();
}

function eligibleCards() {
  const hc = getCard(deck.headCoachId);
  const hcMonths = new Set(hc.months || []);
  return allCards().filter((c) => {
    if (!["Player", "StarPlayer", "AssistantCoach", "Event"].includes(c.type)) return false;
    if (ownedQty(c.id) <= 0) return false;
    if (c.type !== "Event" && !(c.months || []).some((m) => hcMonths.has(m))) return false;
    if (filterText && !c.name.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });
}

function countInDeck(name) {
  return deck.mainDeck.filter((id) => getCard(id).name === name).length;
}

function countInDeckById(cardId) {
  return deck.mainDeck.filter((id) => id === cardId).length;
}

function renderPool() {
  const pool = el("div", { class: "db-pool" });
  for (const card of eligibleCards()) {
    const count = countInDeck(card.name);
    const tile = el("div", { class: "db-card-tile", onclick: () => addCard(card) }, [
      el("img", { src: `/${card.image}`, alt: card.name }),
      el("div", { class: "bbl-badge owned-badge", title: "Copies you own" }, `x${ownedQty(card.id)}`),
      ...(count > 0 ? [el("div", { class: "bbl-badge qty-badge" }, String(count))] : []),
      el("button", { class: "zoom-btn", title: "Zoom in", onclick: (e) => { e.stopPropagation(); showCardZoomWithActions(card.id, []); } }, "🔍"),
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
  if (countInDeckById(card.id) >= ownedQty(card.id)) {
    toast(`You only own ${ownedQty(card.id)} cop${ownedQty(card.id) === 1 ? "y" : "ies"} of "${card.name}".`);
    return;
  }
  deck.mainDeck.push(card.id);
  renderAll();
}

function removeCard(cardId) {
  const idx = deck.mainDeck.indexOf(cardId);
  if (idx !== -1) deck.mainDeck.splice(idx, 1);
  renderAll();
}

function renderDeckPanel() {
  const panel = el("div", { class: "db-deck-panel" });
  const result = validateDeck({ headCoachId: deck.headCoachId, mainDeck: deck.mainDeck, psDeckCount: PS_DECK_SIZE });

  panel.appendChild(el("div", { style: "font-weight:800;color:var(--bbl-blue);" }, `${deck.mainDeck.length} / ${MAIN_DECK_SIZE} cards + 1 Head Coach + ${PS_DECK_SIZE} PLAYERSCORE UP!`));

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
        el("div", { style: "display:flex;gap:4px;" }, [
          el("button", { class: "bbl-btn", style: "padding:2px 8px;font-size:0.75rem;", onclick: () => addCard(g.card) }, "+1"),
          el("button", { class: "bbl-btn secondary", style: "padding:2px 8px;font-size:0.75rem;", onclick: () => removeCard(g.id) }, "-1"),
        ]),
      ])
    )
  );
  panel.appendChild(el("div", { style: "font-weight:700;" }, "Deck List"));
  panel.appendChild(list);

  panel.appendChild(
    el(
      "div",
      { class: "db-collapse-header", style: "font-weight:700;margin-top:8px;cursor:pointer;user-select:none;", onclick: () => { savedDecksExpanded = !savedDecksExpanded; renderAll(); } },
      `${savedDecksExpanded ? "▼" : "▶"} Your Saved Decks (${savedDecksCache.length})`
    )
  );
  if (!savedDecksExpanded) return panel;
  const saved = el(
    "div",
    { class: "db-saved-decks" },
    savedDecksCache.map((d) => {
      const dLegal = validateDeck({ headCoachId: d.headCoachId, mainDeck: d.mainDeck, psDeckCount: PS_DECK_SIZE }).legal;
      return el("div", { class: "db-deck-row" }, [
        el(
          "span",
          {
            style: `cursor:pointer;${dLegal ? "" : "color:var(--bbl-red);"}`,
            title: dLegal ? "" : "Incomplete draft - not legal to play yet",
            // Deep-copy mainDeck - `{ ...d }` alone would leave deck.mainDeck as the SAME
            // array reference living in savedDecksCache, so editing this "copy" (add/removeCard
            // both push/splice in place) would silently corrupt the cached saved deck even
            // without hitting Save, and persist that corruption to the next Save. This is the
            // root cause of decks randomly ending up with the wrong card count after being
            // loaded, tweaked, and abandoned or re-saved.
            onclick: () => { deck = { ...d, mainDeck: [...d.mainDeck] }; renderAll(); },
          },
          `${d.name}${dLegal ? "" : " (draft)"}`
        ),
        el(
          "button",
          {
            class: "bbl-btn secondary",
            style: "padding:2px 8px;font-size:0.75rem;",
            onclick: async () => {
              await removeSavedDeck(d);
              savedDecksCache = await loadSavedDecks().catch(() => []);
              renderAll();
            },
          },
          "Delete"
        ),
      ]);
    })
  );
  panel.appendChild(saved);

  return panel;
}
