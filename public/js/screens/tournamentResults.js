import { el, showScreen } from "../screens.js";
import { renderMenu } from "./menu.js";
import { toast } from "../ui.js";

// Fixed per-month colors, as specified for the Head Coach Month Usage pie chart - not a
// generated/validated categorical palette, since these are deliberately chosen to match each
// month's own branding rather than an accessible hue sequence. Text/legend labels always pair
// the swatch with the month name and percentage, so identity is never color-alone.
const MONTH_COLORS = {
  January: "orange",
  February: "purple",
  March: "teal",
  April: "silver",
  May: "darkgreen",
  June: "lightpink",
  July: "red",
  August: "lime",
  September: "darkblue",
  October: "hotpink",
  November: "yellow",
  December: "lightblue",
};

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function pieSlicePath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

/** Renders `monthUsage` (see the data-shape comment below) as an SVG pie chart with a
 * swatch+name+percentage legend for every month, including the 0% ones (so a month's absence
 * is as visible as its presence, and identity never depends on color alone).
 *
 * Built via an HTML string rather than screens.js's el() helper - el() creates elements with
 * document.createElement, which puts them in the HTML namespace; SVG tags created that way
 * silently fail to render (wrong namespace), so raw markup + innerHTML is used for the SVG
 * part specifically (the legend below it still uses el() as normal, since that's plain HTML). */
function buildMonthUsagePieChart(monthUsage) {
  const entries = Object.entries(monthUsage);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const cx = 110;
  const cy = 110;
  const r = 90;
  let angle = 0;
  let shapesSvg = "";
  if (total > 0) {
    for (const [month, count] of entries) {
      if (count <= 0) continue;
      const pct = count / total;
      const startAngle = angle;
      const endAngle = angle + pct * 360;
      const color = MONTH_COLORS[month] || "gray";
      shapesSvg += `<path d="${pieSlicePath(cx, cy, r, startAngle, endAngle)}" fill="${color}" stroke="var(--bbl-black)" stroke-width="1.5" />`;
      // Direct label on slices big enough to hold one (>=8%), placed at the slice's own
      // midpoint radius/angle - selective direct labeling instead of one on every slice.
      if (pct >= 0.08) {
        const mid = polarToCartesian(cx, cy, r * 0.65, (startAngle + endAngle) / 2);
        shapesSvg += `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="800" fill="var(--bbl-black)">${(pct * 100).toFixed(2)}%</text>`;
      }
      angle = endAngle;
    }
  } else {
    shapesSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bbl-black)" stroke-width="1.5" stroke-dasharray="4 4" />`;
  }
  const svgWrap = el("div", { style: "width:180px;height:180px;flex:0 0 auto;" });
  svgWrap.innerHTML = `<svg viewBox="0 0 220 220" style="width:100%;height:100%;">${shapesSvg}</svg>`;
  const svg = svgWrap.firstElementChild;

  const legend = el(
    "div",
    { style: "display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;font-size:0.85rem;width:100%;max-width:320px;" },
    entries.map(([month, count]) =>
      el("div", { style: "display:flex;align-items:center;gap:6px;" }, [
        el("span", { style: `width:12px;height:12px;border-radius:3px;border:1.5px solid var(--bbl-black);background:${MONTH_COLORS[month] || "gray"};flex:0 0 auto;` }),
        el("span", {}, `${month} - ${total > 0 ? `${((count / total) * 100).toFixed(2)}%` : "0.00%"}`),
      ])
    )
  );

  // Always stacked (chart above legend), never side-by-side - at this panel's width, a
  // side-by-side legend has too little room for month names + percentages and wraps into an
  // unreadable narrow column.
  return el("div", { style: "display:flex;flex-direction:column;align-items:center;gap:12px;" }, [svg, legend]);
}

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
  // Set synchronously, before the await below - the caller (menu.js) calls showScreen()
  // right after calling this function, without awaiting it, so that runs while the fetch
  // is still pending. If className were instead (re)assigned inside renderBody() - which
  // only runs once the fetch resolves - it would wipe out the "active" class showScreen()
  // had already added by then, leaving the screen fully rendered but invisible.
  const root = document.getElementById("tournament-results-screen");
  root.className = "screen menu-screen";
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
      panel.appendChild(buildMonthUsagePieChart(tournament.monthUsage));
    }
  }

  panel.appendChild(el("button", { class: "bbl-btn secondary", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"));
  root.appendChild(panel);
}
