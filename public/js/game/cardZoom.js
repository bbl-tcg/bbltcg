import { cardImg } from "./render.js";

/**
 * Zooms in on a card and, if any actions are passed, offers them as buttons underneath -
 * "activate this effect", "attack with this", "attach a PLAYERSCORE UP!", "play this card",
 * etc. Closes on its own "Close" button or by clicking the dimmed background; picking an
 * action closes it too. This is the single interaction surface for every field/hand card
 * click in both local and multiplayer play - each caller just computes which actions make
 * sense for that card in its own game-state representation.
 */
export function showCardZoomWithActions(cardId, actions = []) {
  const overlay = document.createElement("div");
  overlay.className = "card-zoom-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px;max-width:92vw;";

  const img = document.createElement("img");
  img.src = cardImg(cardId);
  wrap.appendChild(img);

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:90vw;";
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.className = "bbl-btn";
    btn.textContent = action.label;
    btn.onclick = () => {
      overlay.remove();
      action.onClick?.();
    };
    row.appendChild(btn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "bbl-btn ghost";
  closeBtn.textContent = "Close";
  closeBtn.onclick = () => overlay.remove();
  row.appendChild(closeBtn);
  wrap.appendChild(row);

  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}
