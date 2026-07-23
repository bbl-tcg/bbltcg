import { el, showScreen } from "../screens.js";
import { renderRulebook } from "./rulebook.js";
import { renderPlaySetup } from "./playSetup.js";
import { renderDeckbuilder } from "./deckbuilder.js";
import { renderLogin } from "./login.js";
import { renderCollection } from "./collection.js";
import { renderPacks } from "./packs.js";
import { renderMultiplayerSetup } from "./multiplayerSetup.js";
import { renderTrade } from "./trade.js";
import { renderCodes } from "./codes.js";
import { toast } from "../ui.js";
import { getPackPoints } from "../storage.js";
import { currentUser, isLoggedIn, logout } from "../api.js";

export function renderMenu() {
  const root = document.getElementById("menu-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  root.appendChild(el("img", { class: "menu-logo", src: "/assets/branding/logo.png", alt: "Big Ball League TCG" }));
  root.appendChild(el("div", { class: "menu-title" }, "Big Ball League TCG"));
  if (isLoggedIn()) {
    root.appendChild(el("div", { style: "color:var(--bbl-blue);font-weight:700;" }, `Welcome, ${currentUser().username}`));
  }

  // Grid order (2 columns, row-major): row 1 = Play/Online Multiplayer, row 2 =
  // Deckbuilder/Collection, row 3 = Open a Pack!/Trade Cards, row 4 = Rulebook/Log Out.
  const buttons = el("div", { class: "menu-buttons" }, [
    el("button", { class: "bbl-btn", onclick: () => { renderPlaySetup(); showScreen("game-setup-screen"); } }, "Play"),
    el("button", { class: "bbl-btn", onclick: () => guardLogin(() => { renderMultiplayerSetup(); showScreen("game-setup-screen"); }) }, "Online Multiplayer"),
    el("button", { class: "bbl-btn", onclick: () => { renderDeckbuilder(); showScreen("deckbuilder-screen"); } }, "Deckbuilder"),
    el("button", { class: "bbl-btn", onclick: () => guardLogin(() => { renderCollection(); showScreen("collection-screen"); }) }, "Collection"),
    el("button", { class: "bbl-btn", onclick: () => guardLogin(() => { renderPacks(); showScreen("packs-screen"); }) }, "Open a Pack!"),
    el("button", { class: "bbl-btn", onclick: () => guardLogin(() => { renderTrade(); showScreen("trade-screen"); }) }, "Trade Cards"),
    el("button", { class: "bbl-btn", onclick: () => { renderRulebook(); showScreen("rulebook-screen"); } }, "Rulebook"),
    isLoggedIn()
      ? el("button", { class: "bbl-btn ghost", onclick: async () => { await logout(); renderMenu(); showScreen("menu-screen"); } }, "Log Out")
      : el("button", { class: "bbl-btn ghost", onclick: () => { renderLogin(); showScreen("login-screen"); } }, "Login"),
  ]);
  root.appendChild(buttons);

  const footer = el("div", { class: "menu-footer" }, [
    el("div", { class: "pack-points-pill" }, `Pack Points: ${isLoggedIn() ? currentUser().packPoints : getPackPoints()}`),
    el("div", { class: "menu-footer-row" }, [
      el("button", { class: "bbl-btn", onclick: () => guardLogin(() => { renderCodes(); showScreen("codes-screen"); }) }, "Community Codes"),
      el("a", { class: "bbl-btn coffee-btn", href: "https://buymeacoffee.com/bbltcg", target: "_blank", rel: "noopener" }, "Buy me a coffee"),
    ]),
    el("div", { class: "menu-footer-row" }, [
      el("a", { class: "bbl-btn discord-btn", href: "https://discord.gg/fBTm5eRD3C", target: "_blank", rel: "noopener" }, "Join the Discord!"),
      el("a", { class: "bbl-btn instagram-btn", href: "https://www.instagram.com/bigballleague", target: "_blank", rel: "noopener" }, "BBL Instagram"),
    ]),
  ]);
  root.appendChild(footer);
}

function guardLogin(fn) {
  if (!isLoggedIn()) {
    toast("Log in first to use this feature - your collection lives on your account.");
    renderLogin();
    showScreen("login-screen");
    return;
  }
  fn();
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
