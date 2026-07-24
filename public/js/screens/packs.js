import { el, showScreen } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { openPack, sellCards, currentUser, getCollection } from "../api.js";
import { toast, confirmDialog } from "../ui.js";
import { renderMenu } from "./menu.js";

const PACK_COST = 3;
const SELL_COUNT = 50;
const SELL_REWARD = 3;
const CARD_BACK = "/assets/cards/back.png";
// Only the last of the 8 slots can roll one of these (see server/packOdds.js) - that's the
// one worth making a fuss over.
const SPECIAL_RARITIES = new Set(["Alternative Art", "Secret Rare"]);

function statsText() {
  const u = currentUser();
  return `Packs Opened: ${u?.packsOpened ?? 0} | Alt Arts Pulled: ${u?.altArtsPulled ?? 0} | Secret Rares Pulled: ${u?.secretRaresPulled ?? 0}`;
}

/** Resolves once the browser has actually fetched `src` (or failed to - either way, callers
 * shouldn't hang forever on one bad image). Used to warm the cache for the 8 pulled cards
 * before the reveal stack becomes clickable, so flipping a card shows it instantly instead
 * of a blank/white beat while the image downloads for the first time. */
function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src;
  });
}

export function renderPacks() {
  const root = document.getElementById("packs-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const pointsLine = el("div", { style: "font-weight:800;color:var(--bbl-blue);font-size:1.1rem;" }, `Pack Points: ${currentUser()?.packPoints ?? 0}`);
  const statsLine = el("div", { style: "color:#666;font-size:0.85rem;" }, statsText());
  const godPackLine = el(
    "div",
    { style: "font-weight:800;color:#b8860b;font-size:0.95rem;display:" + (currentUser()?.godPackPending ? "block" : "none") + ";" },
    "✨ GOD PACK pending - your next pack is guaranteed rares/alt arts + a secret rare!"
  );
  const stage = el("div", { class: "pack-stage" });
  const hint = el(
    "div",
    { style: "color:#666;text-align:center;" },
    currentUser()?.godPackPending ? `Click the pack to open your GOD PACK! (costs ${PACK_COST} Pack Points)` : `Click the pack to open it (costs ${PACK_COST} Pack Points)`
  );

  let cardIds = null;
  let revealedCount = 0;

  const packImg = el("img", { src: "/assets/packs/booster.png", alt: "Booster Pack", class: "pack-image" });
  packImg.onclick = onOpenPack;

  async function onOpenPack() {
    if ((currentUser()?.packPoints ?? 0) < PACK_COST) {
      toast(`Not enough Pack Points (costs ${PACK_COST}).`);
      return;
    }
    packImg.onclick = null; // prevent double-open mid-animation
    packImg.classList.add("pack-ripping");
    let result;
    try {
      result = await openPack();
    } catch (err) {
      toast(err.message);
      packImg.classList.remove("pack-ripping");
      packImg.onclick = onOpenPack;
      return;
    }
    pointsLine.textContent = `Pack Points: ${currentUser().packPoints}`;
    // NOT statsLine here: the account's alt-art/secret-rare counts are already updated
    // server-side the instant the pack is opened, but showing that on screen this early
    // would spoil/pre-empt the big reveal - statsLine only catches up once the player
    // actually flips the last (only-special-eligible) card, in revealCurrent() below.
    godPackLine.style.display = currentUser()?.godPackPending ? "block" : "none";
    // Preload all 8 card images while the rip animation plays, so revealing each one shows
    // it instantly instead of a blank beat while it downloads for the first time. Runs
    // alongside (not after) the animation delay - only adds real wait time if a card image
    // is unusually slow to fetch.
    const preload = Promise.all(result.cardIds.map((id) => preloadImage(`/${getCard(id).image}`)));
    await Promise.all([preload, new Promise((r) => setTimeout(r, 550))]);
    cardIds = result.cardIds;
    revealedCount = 0;
    packImg.style.display = "none";
    packImg.classList.remove("pack-ripping");
    hint.textContent = result.isGodPack ? "GOD PACK! Click each card to reveal it" : "Click the card to reveal it";
    renderStack();
  }

  function renderStack() {
    stage.innerHTML = "";
    if (!cardIds) return;

    if (revealedCount >= cardIds.length) {
      // Only now (the last card flipped, or "Skip Reveal" jumping straight to seeing every
      // card at once) catch the displayed counter up to the account's real, already-updated
      // totals - see the comment in onOpenPack().
      statsLine.textContent = statsText();
      hint.textContent = "Pack complete!";
      const doneRow = el("div", { style: "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:96vw;" });
      for (const cardId of cardIds) {
        const card = getCard(cardId);
        doneRow.appendChild(
          el("div", { style: "width:70px;" }, [el("img", { src: `/${card.image}`, alt: card.name, style: "width:100%;border-radius:6px;border:1.5px solid var(--bbl-black);" })])
        );
      }
      stage.appendChild(doneRow);
      stage.appendChild(
        el(
          "button",
          {
            class: "bbl-btn",
            style: "margin-top:14px;",
            onclick: () => {
              cardIds = null;
              revealedCount = 0;
              packImg.style.display = "";
              packImg.onclick = onOpenPack;
              hint.textContent = currentUser()?.godPackPending
                ? `Click the pack to open your GOD PACK! (costs ${PACK_COST} Pack Points)`
                : `Click the pack to open it (costs ${PACK_COST} Pack Points)`;
              renderStack();
            },
          },
          "Open Another Pack"
        )
      );
      return;
    }

    const cardId = cardIds[revealedCount];
    const card = getCard(cardId);
    const isLastSlot = revealedCount === cardIds.length - 1;
    const isSpecial = isLastSlot && SPECIAL_RARITIES.has(card.rarity);

    const cardEl = el("div", { class: "pack-reveal-card", style: `background-image:url(${CARD_BACK});` });
    cardEl.onclick = () => revealCurrent(cardEl, card, isSpecial);
    stage.appendChild(cardEl);
    stage.appendChild(el("div", { style: "color:#666;margin-top:8px;text-align:center;" }, `Card ${revealedCount + 1} of ${cardIds.length}`));
    stage.appendChild(
      el(
        "button",
        {
          class: "bbl-btn ghost",
          style: "margin-top:10px;",
          onclick: () => {
            revealedCount = cardIds.length;
            renderStack();
          },
        },
        "Skip Reveal"
      )
    );
  }

  function revealCurrent(cardEl, card, isSpecial) {
    cardEl.onclick = null;
    cardEl.classList.add("flipping");
    setTimeout(() => {
      cardEl.style.backgroundImage = `url(/${card.image})`;
      cardEl.classList.remove("flipping");
      // The 8th slot is the only one that can roll Alt Art/Secret Rare (see
      // server/packOdds.js) - catch the displayed counter up to the account's real,
      // already-updated totals right as its face is revealed, not a click later. The
      // "pack complete" branch in renderStack() covers the Skip Reveal path, which never
      // flips any card individually.
      if (revealedCount === cardIds.length - 1) statsLine.textContent = statsText();
      // Every non-Common pull gets a sparkle; the rare 8th-slot Alt Art/Secret Rare pulls
      // additionally get a full spin, since those are the ones worth celebrating loudly.
      if (isSpecial) cardEl.classList.add("spin-rare");
      else if (card.rarity !== "Common") cardEl.classList.add("sparkle");
      cardEl.onclick = () => {
        revealedCount++;
        renderStack();
      };
    }, 180);
  }

  root.appendChild(el("button", { class: "bbl-btn ghost", style: "position:absolute;top:10px;left:10px;", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"));
  root.appendChild(el("div", { class: "menu-title" }, "Open a Pack!"));
  root.appendChild(pointsLine);
  root.appendChild(statsLine);
  root.appendChild(godPackLine);
  root.appendChild(packImg);
  root.appendChild(stage);
  root.appendChild(hint);
  root.appendChild(
    el(
      "button",
      { class: "bbl-btn secondary", style: "margin-top:18px;", onclick: () => openSellModal(pointsLine) },
      `Sell ${SELL_COUNT} Cards for ${SELL_REWARD} Pack Points`
    )
  );
}

/**
 * Lets the player pick any SELL_COUNT owned cards (any kind/rarity, duplicates fine) and
 * sell them all at once for a flat SELL_REWARD Pack Points - a way to convert an oversized
 * collection into something spendable. `pointsLine` is the caller's own Pack Points display
 * element, updated in place on a successful sale so the screen behind the modal reflects it
 * immediately without a full re-render.
 */
async function openSellModal(pointsLine) {
  let collection;
  try {
    collection = await getCollection();
  } catch (err) {
    toast("Couldn't load your collection: " + err.message);
    return;
  }
  const ownedIds = Object.keys(collection)
    .filter((id) => collection[id] > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // selection[cardId] = how many copies of that card are currently piled up to sell.
  const selection = {};
  const selectedTotal = () => Object.values(selection).reduce((sum, n) => sum + n, 0);

  const overlay = el("div", { class: "choice-overlay" });
  const countLine = el("div", { style: "font-weight:800;color:var(--bbl-blue);" }, `0 / ${SELL_COUNT} selected`);
  const grid = el("div", { class: "choice-options", style: "max-height:38vh;overflow-y:auto;" });
  const pileList = el("div", { class: "db-deck-list", style: "max-height:20vh;overflow-y:auto;" });
  const sellBtn = el("button", { class: "bbl-btn", disabled: "disabled" }, "Sell");

  function refreshCounters() {
    const total = selectedTotal();
    countLine.textContent = `${total} / ${SELL_COUNT} selected`;
    countLine.style.color = total === SELL_COUNT ? "var(--bbl-blue)" : "var(--bbl-red)";
    if (total === SELL_COUNT) sellBtn.removeAttribute("disabled");
    else sellBtn.setAttribute("disabled", "disabled");

    pileList.innerHTML = "";
    for (const cardId of Object.keys(selection)) {
      if (selection[cardId] <= 0) continue;
      const card = getCard(cardId);
      pileList.appendChild(
        el("div", { class: "db-deck-row" }, [
          el("span", {}, `${card.name} x${selection[cardId]}`),
          el(
            "button",
            {
              class: "bbl-btn secondary",
              style: "padding:2px 8px;font-size:0.75rem;",
              onclick: () => {
                selection[cardId] -= 1;
                refreshCounters();
              },
            },
            "-1"
          ),
        ])
      );
    }
  }

  for (const cardId of ownedIds) {
    const card = getCard(cardId);
    const tile = el(
      "div",
      {
        class: "db-card-tile",
        onclick: () => {
          const already = selection[cardId] || 0;
          if (already >= collection[cardId]) return toast(`You only own ${collection[cardId]} cop${collection[cardId] === 1 ? "y" : "ies"} of "${card.name}".`);
          if (selectedTotal() >= SELL_COUNT) return toast(`You already have ${SELL_COUNT} selected - remove some from the pile first.`);
          selection[cardId] = already + 1;
          refreshCounters();
        },
      },
      [
        el("img", { src: `/${card.image}`, alt: card.name }),
        el("div", { class: "bbl-badge owned-badge", title: "Copies you own" }, `x${collection[cardId]}`),
      ]
    );
    grid.appendChild(tile);
  }

  sellBtn.onclick = async () => {
    const cardIds = Object.entries(selection).flatMap(([cardId, count]) => Array(count).fill(cardId));
    if (cardIds.length !== SELL_COUNT) return; // shouldn't happen - button is disabled otherwise
    if (!(await confirmDialog(`Sell these ${SELL_COUNT} cards for ${SELL_REWARD} Pack Points? This can't be undone.`))) return;
    try {
      const packPoints = await sellCards(cardIds);
      pointsLine.textContent = `Pack Points: ${packPoints}`;
      toast(`Sold! +${SELL_REWARD} Pack Points.`);
      overlay.remove();
    } catch (err) {
      toast("Couldn't sell: " + err.message);
    }
  };

  const panel = el("div", { class: "choice-panel bbl-panel" }, [
    el("div", { style: "font-weight:800;font-size:1.05rem;color:var(--bbl-blue);" }, `Sell ${SELL_COUNT} Cards for ${SELL_REWARD} Pack Points`),
    el("div", { style: "font-size:0.85rem;" }, "Click cards below to add them to the pile - any kind, any rarity, duplicates are fine. Sold cards are gone for good."),
    countLine,
    grid,
    pileList,
    el("div", { style: "display:flex;gap:10px;justify-content:center;" }, [sellBtn, el("button", { class: "bbl-btn ghost", onclick: () => overlay.remove() }, "Cancel")]),
  ]);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
