import { el, showScreen } from "../screens.js";
import { startLocalMatch } from "../game/localMatch.js";
import { allDeckOptions } from "../deckOptions.js";
import { toast } from "../ui.js";
import { renderMenu } from "./menu.js";

export async function renderPlaySetup() {
  const root = document.getElementById("game-setup-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";
  root.appendChild(el("div", { style: "color:white;" }, "Loading decks..."));

  const options = await allDeckOptions();
  const RANDOM_KEY = "__random__";

  const deckASelect = el(
    "select",
    {},
    options.map((o) => el("option", { value: o.key }, o.label))
  );
  const deckBSelect = el("select", {}, [
    el("option", { value: RANDOM_KEY }, "Random"),
    ...options.map((o, i) => el("option", { value: o.key, selected: i === 1 ? "selected" : undefined }, o.label)),
  ]);

  const opponentTypeSelect = el("select", {}, [
    el("option", { value: "bot" }, "Bot opponent"),
    el("option", { value: "hotseat" }, "Pass-and-play (2 players, same screen)"),
  ]);

  const firstPlayerSelect = el("select", {}, [
    el("option", { value: "random" }, "Random (die roll)"),
    el("option", { value: "me" }, "I go first"),
    el("option", { value: "opponent" }, "Opponent goes first"),
  ]);
  const firstPlayerRow = labeledRow("Who goes first?", firstPlayerSelect);
  opponentTypeSelect.addEventListener("change", () => {
    firstPlayerRow.style.display = opponentTypeSelect.value === "bot" ? "flex" : "none";
  });

  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "bbl-panel", style: "padding:24px;max-width:420px;width:92vw;display:flex;flex-direction:column;gap:14px;" }, [
      el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Start a Match"),
      labeledRow("Your deck", deckASelect),
      labeledRow("Opponent deck", deckBSelect),
      labeledRow("Opponent", opponentTypeSelect),
      firstPlayerRow,
      el(
        "button",
        {
          class: "bbl-btn",
          onclick: () => {
            const resolveByKey = (key) => {
              if (key === RANDOM_KEY) {
                const pick = options[Math.floor(Math.random() * options.length)];
                return pick.resolve();
              }
              return options.find((o) => o.key === key)?.resolve();
            };
            const deckA = resolveByKey(deckASelect.value);
            const deckB = resolveByKey(deckBSelect.value);
            if (!deckA || !deckB) {
              toast("Build or pick a deck for both sides first.");
              return;
            }
            showScreen("game-screen");
            startLocalMatch({
              deckA,
              deckB,
              vsBot: opponentTypeSelect.value === "bot",
              firstPlayerChoice: firstPlayerSelect.value,
            });
          },
        },
        "Start Game"
      ),
      el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "Cancel"),
    ])
  );
}

function labeledRow(label, control) {
  control.style.width = "100%";
  control.style.padding = "8px";
  control.style.borderRadius = "6px";
  control.style.border = "2px solid var(--bbl-black)";
  return el("label", { style: "display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--bbl-blue);" }, [label, control]);
}
