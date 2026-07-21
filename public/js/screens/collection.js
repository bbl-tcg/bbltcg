import { el, showScreen } from "../screens.js";
import { allCards } from "/shared/engine/cardDb.js";
import { getCollection } from "../api.js";
import { toast } from "../ui.js";
import { showCardZoomWithActions } from "../game/cardZoom.js";
import { renderMenu } from "./menu.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

  const owned = allCards().filter((c) => collection[c.id] > 0);
  let sortBy = "none";
  let month = MONTHS[0];

  root.innerHTML = "";
  const monthSelect = el(
    "select",
    { onchange: (e) => { month = e.target.value; renderGrid(); } },
    MONTHS.map((m) => el("option", { value: m }, m))
  );
  monthSelect.value = month;
  monthSelect.style.display = "none";

  const sortSelect = el(
    "select",
    {
      onchange: (e) => {
        sortBy = e.target.value;
        monthSelect.style.display = sortBy === "month" ? "" : "none";
        renderGrid();
      },
    },
    [
      el("option", { value: "none" }, "Sort/Filter..."),
      el("option", { value: "month" }, "Month"),
      el("option", { value: "cost" }, "Cost"),
      el("option", { value: "health" }, "Health"),
      el("option", { value: "attack" }, "Attack"),
      el("option", { value: "altArt" }, "Alt Arts only"),
      el("option", { value: "secretRare" }, "Secret Rares only"),
    ]
  );

  const topbar = el("div", { class: "db-topbar" }, [
    el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"),
    el("span", { style: "font-weight:800;" }, `Your Collection (${Object.values(collection).reduce((a, b) => a + b, 0)} cards)`),
    sortSelect,
    monthSelect,
  ]);
  root.appendChild(topbar);

  // The mobile (max-width:700px) rule for .db-pool assumes a .db-body wrapper handles
  // scrolling instead (see deckbuilder.css) - without it here too, .db-pool's overflow gets
  // set to visible on mobile with no scrollable ancestor to catch it, so the grid was
  // completely unscrollable on phones even though it scrolled fine on desktop (where
  // .db-pool scrolls itself).
  const body = el("div", { class: "db-body" });
  const grid = el("div", { class: "db-pool" });
  body.appendChild(grid);
  root.appendChild(body);

  function cardsToShow() {
    if (sortBy === "altArt") return owned.filter((c) => c.rarity === "Alternative Art");
    if (sortBy === "secretRare") return owned.filter((c) => c.rarity === "Secret Rare");
    if (sortBy === "month") {
      // Events are month-unlocked in this set (any Event can go in any deck regardless of
      // its own head coach's month - see deckLegality.js) - matches "all cards that can be
      // added to that month's deck" rather than just cards printed with that month.
      return owned.filter((c) => c.type === "Event" || (c.months || []).includes(month));
    }
    if (sortBy === "cost" || sortBy === "health" || sortBy === "attack") {
      return [...owned].sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // cards without this stat (e.g. Head Coach has no cost) sort last
        if (bv == null) return -1;
        return av - bv;
      });
    }
    return owned;
  }

  function renderGrid() {
    grid.innerHTML = "";
    const cards = cardsToShow();
    if (owned.length === 0) {
      grid.appendChild(el("div", { style: "padding:20px;" }, "You don't own any cards yet - open a pack or start with the starter decks!"));
      return;
    }
    if (cards.length === 0) {
      grid.appendChild(el("div", { style: "padding:20px;" }, "No cards in your collection match this filter."));
      return;
    }
    for (const card of cards) {
      grid.appendChild(
        el("div", { class: "db-card-tile", onclick: () => showCardZoomWithActions(card.id, []) }, [
          el("img", { src: `/${card.image}`, alt: card.name }),
          el("div", { class: "bbl-badge qty-badge" }, String(collection[card.id])),
        ])
      );
    }
  }

  renderGrid();
}
