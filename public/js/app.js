import "/shared/effects/index.js"; // registers all 156 card effects - must load before any local/hot-seat game runs
import { loadCardDb } from "./loadCardDb.js";
import { showScreen, currentScreenKind } from "./screens.js";
import { renderMenu } from "./screens/menu.js";
import { ensureFirstRunBonus } from "./storage.js";
import { fetchMe, sendHeartbeat, isLoggedIn } from "./api.js";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

async function boot() {
  await loadCardDb();
  ensureFirstRunBonus();
  await fetchMe(); // silently no-ops if not logged in
  renderMenu();
  showScreen("menu-screen");

  setInterval(() => {
    if (isLoggedIn()) sendHeartbeat(currentScreenKind());
  }, HEARTBEAT_INTERVAL_MS);
}

boot().catch((err) => {
  console.error("Failed to start BBLTCG:", err);
  document.getElementById("loading-screen").innerHTML = `<div style="color:white;padding:24px;">Failed to load: ${err.message}</div>`;
});

// Dev-only visibility: surface otherwise-silent errors from async game logic on screen.
window.addEventListener("error", (e) => window.__lastError = { message: e.message, stack: e.error?.stack });
window.addEventListener("unhandledrejection", (e) => window.__lastError = { message: String(e.reason), stack: e.reason?.stack });
