import { el, showScreen } from "../screens.js";
import { starterDeckNames } from "/shared/engine/cardDb.js";
import { startLocalMatch } from "../game/localMatch.js";

export function renderPlaySetup() {
  const root = document.getElementById("game-setup-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const decks = starterDeckNames();

  const deckASelect = el(
    "select",
    {},
    decks.map((d) => el("option", { value: d }, d))
  );
  const deckBSelect = el(
    "select",
    {},
    decks.map((d, i) => el("option", { value: d, selected: i === 1 ? "selected" : undefined }, d))
  );
  deckBSelect.value = decks[1] || decks[0];

  const opponentTypeSelect = el("select", {}, [
    el("option", { value: "bot" }, "Bot opponent"),
    el("option", { value: "hotseat" }, "Pass-and-play (2 players, same screen)"),
  ]);

  root.appendChild(
    el("div", { class: "bbl-panel", style: "padding:24px;max-width:420px;width:92vw;display:flex;flex-direction:column;gap:14px;" }, [
      el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Start a Match"),
      labeledRow("Your deck (starter)", deckASelect),
      labeledRow("Opponent deck (starter)", deckBSelect),
      labeledRow("Opponent", opponentTypeSelect),
      el(
        "button",
        {
          class: "bbl-btn",
          onclick: () => {
            showScreen("game-screen");
            startLocalMatch({
              deckAName: deckASelect.value,
              deckBName: deckBSelect.value,
              vsBot: opponentTypeSelect.value === "bot",
            });
          },
        },
        "Start Game"
      ),
      el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "Cancel"),
    ])
  );
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
}

function labeledRow(label, control) {
  control.style.width = "100%";
  control.style.padding = "8px";
  control.style.borderRadius = "6px";
  control.style.border = "2px solid var(--bbl-black)";
  return el("label", { style: "display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--bbl-blue);" }, [label, control]);
}
