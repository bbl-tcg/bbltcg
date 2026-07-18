import { el, showScreen } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { openPack, currentUser } from "../api.js";
import { toast } from "../ui.js";
import { renderMenu } from "./menu.js";

const PACK_COST = 3;
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
  const stage = el("div", { class: "pack-stage" });
  const hint = el("div", { style: "color:#666;text-align:center;" }, `Click the pack to open it (costs ${PACK_COST} Pack Points)`);

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
    statsLine.textContent = statsText();
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
    hint.textContent = "Click the card to reveal it";
    renderStack();
  }

  function renderStack() {
    stage.innerHTML = "";
    if (!cardIds) return;

    if (revealedCount >= cardIds.length) {
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
              hint.textContent = `Click the pack to open it (costs ${PACK_COST} Pack Points)`;
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
  root.appendChild(packImg);
  root.appendChild(stage);
  root.appendChild(hint);
}
