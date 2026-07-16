import { el, showScreen } from "../screens.js";
import { allDeckOptions } from "../deckOptions.js";
import { createMultiplayerRoom, joinMultiplayerRoom } from "../game/multiplayerMatch.js";
import { toast } from "../ui.js";
import { renderMenu } from "./menu.js";

export async function renderMultiplayerSetup() {
  const root = document.getElementById("game-setup-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";
  root.appendChild(el("div", { style: "color:white;" }, "Loading decks..."));

  const options = await allDeckOptions();
  const deckSelect = el(
    "select",
    { style: rowStyle() },
    options.map((o) => el("option", { value: o.key }, o.label))
  );
  const codeInput = el("input", { type: "text", placeholder: "Invite code", maxlength: "6", style: rowStyle() });
  const statusLine = el("div", { style: "font-weight:700;color:var(--bbl-blue);min-height:1.4em;" }, "");

  function resolveDeck() {
    return options.find((o) => o.key === deckSelect.value)?.resolve();
  }

  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "bbl-panel", style: "padding:24px;max-width:420px;width:92vw;display:flex;flex-direction:column;gap:14px;" }, [
      el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Online Multiplayer"),
      labeled("Your deck", deckSelect),
      statusLine,
      el(
        "button",
        {
          class: "bbl-btn",
          onclick: () => {
            const deck = resolveDeck();
            if (!deck) return toast("Pick a deck first.");
            statusLine.textContent = "Creating room...";
            createMultiplayerRoom(deck, (code) => {
              statusLine.textContent = `Invite code: ${code} - share it with your opponent. Waiting for them to join...`;
            });
          },
        },
        "Create Room"
      ),
      el("div", { style: "text-align:center;font-weight:700;" }, "— or —"),
      labeled("Join with a code", codeInput),
      el(
        "button",
        {
          class: "bbl-btn secondary",
          onclick: () => {
            const deck = resolveDeck();
            if (!deck) return toast("Pick a deck first.");
            const code = codeInput.value.trim().toUpperCase();
            if (code.length !== 6) return toast("Enter the 6-character invite code.");
            statusLine.textContent = "Joining...";
            joinMultiplayerRoom(code, deck, () => {
              statusLine.textContent = "Joined! Starting the game...";
              showScreen("game-screen");
            });
          },
        },
        "Join Room"
      ),
      el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "Cancel"),
    ])
  );
}

function labeled(label, control) {
  return el("label", { style: "display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--bbl-blue);" }, [label, control]);
}

function rowStyle() {
  return "width:100%;padding:8px;border-radius:6px;border:2px solid var(--bbl-black);box-sizing:border-box;";
}
