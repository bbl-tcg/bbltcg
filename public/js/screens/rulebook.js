import { el, showScreen } from "../screens.js";

export function renderRulebook() {
  const root = document.getElementById("rulebook-screen");
  root.innerHTML = "";
  root.className = "screen rulebook-screen";
  root.appendChild(
    el("div", { class: "rulebook-content" }, [
      el("div", { class: "rulebook-back" }, [el("button", { class: "bbl-btn ghost", onclick: () => showScreen("menu-screen") }, "← Menu")]),
      el("h1", {}, "Rulebook (full version coming soon)"),
      el("p", {}, "A complete illustrated rulebook is being finished in a later build step."),
    ])
  );
}
