import "/shared/effects/index.js"; // registers all 156 card effects - must load before any local/hot-seat game runs
import { loadCardDb } from "./loadCardDb.js";
import { showScreen, currentScreenKind, el } from "./screens.js";
import { renderMenu } from "./screens/menu.js";
import { ensureFirstRunBonus } from "./storage.js";
import { fetchMe, sendHeartbeat, isLoggedIn } from "./api.js";
import { disconnectMultiplayer, tryResumeActiveMultiplayerGame } from "./game/multiplayerMatch.js";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
// Render's free tier is billed by server uptime, and the heartbeat above (plus any open
// multiplayer socket) keeps the server awake indefinitely as long as a tab sits open - even
// if nobody's actually there. Kicking a truly idle tab after 15 minutes lets those pings
// stop and the free dyno go back to sleep as intended.
const AFK_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"];

let lastActivityAt = null;
let heartbeatIntervalId = null;
let kickedForInactivity = false;

function markActive() {
  lastActivityAt = Date.now();
}

function startIdleTracking() {
  // Start the idle clock here (not at module load) so the boot sequence's own loading time
  // - fetching the card DB, etc. - never counts against it.
  markActive();
  for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, markActive, { passive: true });
  setInterval(() => {
    if (kickedForInactivity) return;
    if (Date.now() - lastActivityAt >= AFK_TIMEOUT_MS) kickForInactivity();
  }, IDLE_CHECK_INTERVAL_MS);
}

function kickForInactivity() {
  kickedForInactivity = true;
  clearInterval(heartbeatIntervalId);
  disconnectMultiplayer();
  document.body.appendChild(
    el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;" }, [
      el(
        "div",
        { class: "bbl-panel", style: "padding:28px;max-width:360px;text-align:center;display:flex;flex-direction:column;gap:14px;" },
        [
          el("div", { style: "font-weight:800;font-size:1.2rem;color:var(--bbl-blue);" }, "Disconnected for inactivity"),
          el("div", {}, "You were away for 15 minutes, so we disconnected you to save server resources."),
          el("button", { class: "bbl-btn", onclick: () => window.location.reload() }, "Reload to keep playing"),
        ]
      ),
    ])
  );
}

async function boot() {
  await loadCardDb();
  ensureFirstRunBonus();
  await fetchMe(); // silently no-ops if not logged in
  renderMenu();
  showScreen("menu-screen");
  // If this browser was mid-multiplayer-match when it lost its connection (network blip,
  // or the page was reloaded/reopened outright), try to pick back up where it left off
  // instead of leaving the player stuck on the menu with no idea what happened to that
  // game - see multiplayerMatch.js's rejoin-room flow. A no-op if there's nothing to resume.
  tryResumeActiveMultiplayerGame();

  heartbeatIntervalId = setInterval(() => {
    if (isLoggedIn()) sendHeartbeat(currentScreenKind());
  }, HEARTBEAT_INTERVAL_MS);

  startIdleTracking();
}

boot().catch((err) => {
  console.error("Failed to start BBLTCG:", err);
  document.getElementById("loading-screen").innerHTML = `<div style="color:white;padding:24px;">Failed to load: ${err.message}</div>`;
});

// Dev-only visibility: surface otherwise-silent errors from async game logic on screen.
window.addEventListener("error", (e) => window.__lastError = { message: e.message, stack: e.error?.stack });
window.addEventListener("unhandledrejection", (e) => window.__lastError = { message: String(e.reason), stack: e.reason?.stack });
