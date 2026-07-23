import { el, showScreen } from "../screens.js";
import { renderMenu } from "./menu.js";
import { toast } from "../ui.js";

/**
 * Data shape (shared/data/tournaments.json), an array of:
 * {
 *   name: string,
 *   date: string,               // "YYYY-MM-DD"
 *   top3: [
 *     { place: 1, username: string, decklist: string },  // decklist: "1x 001-007, 5x 001-001, ..." (see deckText.js)
 *     { place: 2, username: string, decklist: string },
 *     { place: 3, username: string, decklist: string },
 *   ],
 *   monthUsage: { January: number, February: number, ..., December: number },  // how many
 *     entrants' decks were built around each month's Head Coach
 * }
 * Empty array until the first tournament actually happens - fill this file in then.
 */

let tournaments = [];
let selectedIndex = -1;
let expandedPlace = null;

export async function renderTournamentResults() {
  try {
    tournaments = await fetch("/shared/data/tournaments.json").then((r) => r.json());
  } catch {
    tournaments = [];
    toast("Couldn't load tournament data.");
  }
  selectedIndex = tournaments.length > 0 ? 0 : -1;
  expandedPlace = null;
  renderBody();
}

function renderBody() {
  const root = document.getElementById("tournament-results-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const panel = el("div", { class: "bbl-panel", style: "padding:24px;max-width:560px;width:92vw;display:flex;flex-direction:column;gap:14px;max-height:85vh;overflow-y:auto;" }, [
    el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Tournament Results"),
  ]);

  if (tournaments.length === 0) {
    panel.appendChild(el("div", { style: "text-align:center;" }, "No tournaments yet"));
    panel.appendChild(el("button", { class: "bbl-btn secondary", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"));
    root.appendChild(panel);
    return;
  }

  const select = el(
    "select",
    {
      style: "width:100%;padding:8px;border-radius:6px;border:2px solid var(--bbl-black);box-sizing:border-box;",
      onchange: (e) => {
        selectedIndex = Number(e.target.value);
        expandedPlace = null;
        renderBody();
      },
    },
    tournaments.map((t, i) => el("option", { value: String(i), selected: i === selectedIndex ? "selected" : undefined }, t.name))
  );
  panel.appendChild(el("label", { style: "display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--bbl-blue);" }, ["Tournament", select]));

  const tournament = tournaments[selectedIndex];
  if (tournament) {
    if (tournament.date) panel.appendChild(el("div", { style: "font-size:0.85rem;color:#666;" }, tournament.date));

    const placeLabels = { 1: "🥇 1st", 2: "🥈 2nd", 3: "🥉 3rd" };
    const standings = el(
      "div",
      { style: "display:flex;flex-direction:column;gap:8px;" },
      (tournament.top3 || []).map((entry) => {
        const isExpanded = expandedPlace === entry.place;
        const row = el("div", { class: "bbl-panel", style: "padding:10px 14px;" }, [
          el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:10px;" }, [
            el("div", { style: "font-weight:800;" }, `${placeLabels[entry.place] || `#${entry.place}`} - ${entry.username}`),
            el(
              "button",
              {
                class: "bbl-btn ghost",
                style: "padding:2px 10px;font-size:0.8rem;",
                onclick: () => { expandedPlace = isExpanded ? null : entry.place; renderBody(); },
              },
              isExpanded ? "Hide Decklist" : "Show Decklist"
            ),
          ]),
        ]);
        if (isExpanded) {
          const textarea = el("textarea", {
            readonly: "readonly",
            style: "width:100%;min-height:100px;font-family:monospace;font-size:0.8rem;padding:8px;box-sizing:border-box;margin-top:8px;",
          });
          textarea.value = entry.decklist || "";
          row.appendChild(textarea);
        }
        return row;
      })
    );
    panel.appendChild(standings);

    if (tournament.monthUsage) {
      panel.appendChild(el("div", { style: "font-weight:700;margin-top:6px;" }, "Head Coach Month Usage"));
      const table = el(
        "div",
        { style: "display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:0.9rem;" },
        Object.entries(tournament.monthUsage).flatMap(([month, count]) => [
          el("span", {}, month),
          el("span", { style: "font-weight:700;" }, String(count)),
        ])
      );
      panel.appendChild(table);
    }
  }

  panel.appendChild(el("button", { class: "bbl-btn secondary", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"));
  root.appendChild(panel);
}
