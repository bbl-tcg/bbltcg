import { el, showScreen } from "../screens.js";

export function renderDeckbuilder() {
  const root = document.getElementById("deckbuilder-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";
  root.appendChild(el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "← Menu"));
  root.appendChild(el("div", { class: "menu-title" }, "Deckbuilder (full version coming soon)"));
}
