import { el, showScreen } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { openPack, currentUser } from "../api.js";
import { toast } from "../ui.js";

export function renderPacks() {
  const root = document.getElementById("packs-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const pointsLine = el("div", { style: "font-weight:800;color:var(--bbl-blue);font-size:1.1rem;" }, `Pack Points: ${currentUser()?.packPoints ?? 0}`);
  const resultsArea = el("div", { class: "choice-options", style: "justify-content:center;max-width:700px;" });

  const packImg = el("img", {
    src: "/assets/packs/booster.png",
    alt: "Booster Pack",
    style: "width:200px;cursor:pointer;filter:drop-shadow(0 6px 14px rgba(0,0,0,0.4));transition:transform 0.15s;",
    onclick: async () => {
      if ((currentUser()?.packPoints ?? 0) < 1) {
        toast("Not enough Pack Points.");
        return;
      }
      packImg.style.transform = "scale(0.92) rotate(-3deg)";
      try {
        const { cardIds } = await openPack();
        resultsArea.innerHTML = "";
        for (const cardId of cardIds) {
          const card = getCard(cardId);
          resultsArea.appendChild(el("div", { class: "choice-option" }, [el("img", { src: `/${card.image}`, alt: card.name })]));
        }
        pointsLine.textContent = `Pack Points: ${currentUser().packPoints}`;
      } catch (err) {
        toast(err.message);
      }
      setTimeout(() => (packImg.style.transform = ""), 150);
    },
  });

  root.appendChild(el("button", { class: "bbl-btn ghost", style: "position:absolute;top:10px;left:10px;", onclick: () => showScreen("menu-screen") }, "← Menu"));
  root.appendChild(el("div", { class: "menu-title" }, "Open a Pack!"));
  root.appendChild(pointsLine);
  root.appendChild(packImg);
  root.appendChild(el("div", { style: "color:#666;" }, "Click the pack to open it (costs 1 Pack Point)"));
  root.appendChild(resultsArea);
}
