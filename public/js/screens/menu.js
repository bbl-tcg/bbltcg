import { el, showScreen } from "../screens.js";
import { renderRulebook } from "./rulebook.js";
import { renderPlaySetup } from "./playSetup.js";
import { renderDeckbuilder } from "./deckbuilder.js";

export function renderMenu() {
  const root = document.getElementById("menu-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  root.appendChild(el("img", { class: "menu-logo", src: "/assets/branding/logo.png", alt: "Big Ball League TCG" }));
  root.appendChild(el("div", { class: "menu-title" }, "Big Ball League TCG"));

  const buttons = el("div", { class: "menu-buttons" }, [
    el("button", { class: "bbl-btn", onclick: () => { renderPlaySetup(); showScreen("game-setup-screen"); } }, "Play"),
    el("button", { class: "bbl-btn", onclick: () => { renderDeckbuilder(); showScreen("deckbuilder-screen"); } }, "Deckbuilder"),
    el("button", { class: "bbl-btn ghost", onclick: () => notReady("Collection") }, "Collection"),
    el("button", { class: "bbl-btn ghost", onclick: () => notReady("Open a Pack") }, "Open a Pack!"),
    el("button", { class: "bbl-btn ghost", onclick: () => notReady("Multiplayer / Trade") }, "Online Multiplayer"),
    el("button", { class: "bbl-btn", onclick: () => { renderRulebook(); showScreen("rulebook-screen"); } }, "Rulebook"),
    el("button", { class: "bbl-btn ghost", onclick: () => notReady("Login") }, "Login"),
  ]);
  root.appendChild(buttons);

  const footer = el("div", { class: "menu-footer" }, [
    el("div", { class: "pack-points-pill" }, "Pack Points: 5"),
    el("a", { class: "bbl-btn coffee-btn", href: "https://buymeacoffee.com/bbltcg", target: "_blank", rel: "noopener" }, "Buy me a coffee"),
  ]);
  root.appendChild(footer);
}

function notReady(name) {
  alert(`${name} is coming soon in a later build.`);
}

/** Ensure a screen container exists (some screens are created lazily, not hardcoded in index.html). */
export function ensureScreen(id, className) {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement("div");
    node.id = id;
    document.getElementById("app-root").appendChild(node);
  }
  node.className = `screen ${className || ""}`.trim();
  return node;
}

export function backButton(onClick) {
  return el("div", { class: "back-btn-row" }, [el("button", { class: "bbl-btn ghost", onclick: onClick }, "← Menu")]);
}
