import { loadCardDb } from "./loadCardDb.js";
import { showScreen } from "./screens.js";
import { renderMenu } from "./screens/menu.js";
import { ensureFirstRunBonus } from "./storage.js";

async function boot() {
  await loadCardDb();
  ensureFirstRunBonus();
  renderMenu();
  showScreen("menu-screen");
}

boot().catch((err) => {
  console.error("Failed to start BBLTCG:", err);
  document.getElementById("loading-screen").innerHTML = `<div style="color:white;padding:24px;">Failed to load: ${err.message}</div>`;
});

// Dev-only visibility: surface otherwise-silent errors from async game logic on screen.
window.addEventListener("error", (e) => window.__lastError = { message: e.message, stack: e.error?.stack });
window.addEventListener("unhandledrejection", (e) => window.__lastError = { message: String(e.reason), stack: e.reason?.stack });
