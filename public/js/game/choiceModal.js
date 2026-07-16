import { el } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { cardImg } from "./render.js";
import { showCardZoomWithActions } from "./cardZoom.js";

/**
 * Shows a modal for a yielded effect choice request and resolves with the player's answer.
 * Handles the common request shapes used across effect files; falls back to a generic
 * option list for anything unrecognized so an unusual request never silently stalls.
 */
export function showChoice(request) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "choice-overlay" });
    const panel = el("div", { class: "choice-panel bbl-panel" });
    panel.appendChild(el("div", { style: "font-weight:800;font-size:1.05rem;color:var(--bbl-blue);" }, request.prompt || describeType(request.type)));

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    if (request.type === "CHOOSE_YES_NO") {
      panel.appendChild(
        el("div", { style: "display:flex;gap:10px;justify-content:center;" }, [
          el("button", { class: "bbl-btn", onclick: () => finish(true) }, request.yesLabel || "Yes"),
          el("button", { class: "bbl-btn secondary", onclick: () => finish(false) }, request.noLabel || "No"),
        ])
      );
    } else if (request.type === "CHOOSE_FIRST_OR_SECOND") {
      panel.appendChild(
        el("div", { style: "display:flex;gap:10px;justify-content:center;" }, [
          el("button", { class: "bbl-btn", onclick: () => finish("first") }, "Go First"),
          el("button", { class: "bbl-btn secondary", onclick: () => finish("second") }, "Go Second"),
        ])
      );
    } else if (request.type === "CHOOSE_NUMBER") {
      const min = request.min ?? 0;
      const max = request.max ?? 0;
      const row = el("div", { style: "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;" });
      for (let n = min; n <= max; n++) {
        row.appendChild(el("button", { class: "bbl-btn", onclick: () => finish(n) }, String(n)));
      }
      panel.appendChild(row);
    } else if (request.type === "REVEAL_TOP_CARDS") {
      // Purely informational - the effect already decided what happens to these cards, the
      // player just needs to actually see them. Each tile is also zoomable to read closely.
      const cardIds = request.cards || [];
      const grid = el("div", { class: "choice-options" });
      for (const cardId of cardIds) {
        grid.appendChild(
          el("div", { class: "choice-option", onclick: () => showCardZoomWithActions(cardId, []) }, [el("img", { src: cardImg(cardId), alt: getCard(cardId).name })])
        );
      }
      panel.appendChild(grid);
      panel.appendChild(el("button", { class: "bbl-btn", onclick: () => finish(null) }, "Continue"));
    } else if (request.type === "CHOOSE_HAND_CARD_OPTIONAL") {
      const options = request.options || [];
      const grid = buildCardOptionGrid(
        options.map((o) => ({ cardId: o.cardId, label: getCard(o.cardId).name, value: o })),
        (value) => finish(value)
      );
      panel.appendChild(grid);
      panel.appendChild(el("button", { class: "bbl-btn ghost", onclick: () => finish(null) }, "Skip"));
    } else if (request.type === "CHOOSE_EFFECT_SOURCE") {
      const options = request.options || [];
      if (options.length === 0) {
        panel.appendChild(el("div", {}, "Nothing to activate."));
      } else {
        panel.appendChild(buildCardOptionGrid(options, (value) => finish(value)));
      }
      if (request.allowNone) {
        panel.appendChild(el("button", { class: "bbl-btn ghost", onclick: () => finish(null) }, "Pass"));
      }
    } else if (isCardOptionRequest(request)) {
      const options = normalizeCardOptions(request.options, request.type);
      const multi = request.type === "CHOOSE_CARDS" || request.type === "CHOOSE_OPPONENT_PLAYERS" || request.type === "CHOOSE_TWO_OWN_PLAYERS";
      const zoomSelect = request.type === "CHOOSE_OWN_PLAYER" || request.type === "CHOOSE_OPPONENT_PLAYER";
      if (zoomSelect) {
        panel.appendChild(buildZoomSelectGrid(options, (value) => finish(value)));
      } else if (!multi) {
        panel.appendChild(buildCardOptionGrid(options, (value) => finish(value)));
      } else {
        renderMultiSelect(panel, request, options, finish);
      }
    } else {
      // Unknown/unspecified request shape - offer whatever raw options exist, or just
      // let the player continue so a novel request never hangs the game.
      const options = request.options || [];
      if (options.length === 0) {
        panel.appendChild(el("button", { class: "bbl-btn", onclick: () => finish(null) }, "Continue"));
      } else {
        panel.appendChild(buildCardOptionGrid(normalizeCardOptions(options, request.type), (value) => finish(value)));
      }
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}

function describeType(type) {
  return type ? type.replaceAll("_", " ").toLowerCase() : "Make a choice";
}

function isCardOptionRequest(request) {
  return Array.isArray(request.options) && request.options.length >= 0;
}

/**
 * Normalizes options for display only - `value` always stays the ORIGINAL option object
 * (or bare instanceId/cardId string) verbatim, never flattened down to just a cardId.
 * Effect code and match logic that yields `{cardId, handIndex}}`-shaped options (or
 * `{cardId, index, card}` search results, etc.) reads those extra fields back off the
 * resolved value, so losing them here would silently corrupt the answer.
 *
 * `{ __enrichedInstance, instanceId, cardId }` is a display-only shape added by
 * choiceEnrich.js right before a request reaches this modal - it lets CHOOSE_OWN_PLAYER/
 * CHOOSE_OPPONENT_PLAYER/etc. show real card art instead of a raw instance id, while still
 * resolving back to the plain instanceId string the yielding effect actually expects.
 *
 * PLAYERSCORE UP! cards are fungible (no card art of their own, no distinguishing feature),
 * so a bare-string option under a CHOOSE_PS_UP request is labeled "PS UP" rather than
 * showing its raw instance id - though in practice these are auto-resolved without ever
 * reaching a modal (see the CHOOSE_PS_UP call sites), this is a defensive fallback.
 */
function normalizeCardOptions(options, requestType) {
  return (options || []).map((o) => {
    if (o && o.__enrichedInstance) return { cardId: o.cardId, label: getCard(o.cardId).name, value: o.instanceId };
    if (typeof o === "string") {
      const label = requestType === "CHOOSE_PS_UP" ? "PS UP" : null;
      return { cardId: null, instanceId: o, label, value: o };
    }
    if (o.cardId) return { cardId: o.cardId, label: getCard(o.cardId).name, value: o };
    return { cardId: null, instanceId: o, label: null, value: o };
  });
}

function buildCardOptionGrid(options, onPick) {
  const grid = el("div", { class: "choice-options" });
  for (const opt of options) {
    if (opt.cardId) {
      grid.appendChild(
        el("div", { class: "choice-option", onclick: () => onPick(opt.value) }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })])
      );
    } else {
      grid.appendChild(
        el(
          "button",
          { class: "bbl-btn ghost", style: "width:100%;", onclick: () => onPick(opt.value) },
          opt.label || (typeof opt.value === "string" ? opt.value : "Select")
        )
      );
    }
  }
  return grid;
}

/** Same tile grid as buildCardOptionGrid, but clicking a card zooms in first with an
 * explicit "Select"/"Cancel" pair rather than picking instantly - lets the player confirm
 * they've got the right card before committing (per request: "show me the player cards,
 * let me zoom in, and click a button that says Select"). Used for the single-card own/
 * opponent-player-targeting choice types. */
function buildZoomSelectGrid(options, onPick) {
  const grid = el("div", { class: "choice-options" });
  for (const opt of options) {
    if (!opt.cardId) continue;
    const tile = el("div", { class: "choice-option" }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })]);
    tile.onclick = () => {
      const zoomOverlay = el("div", { class: "card-zoom-overlay" });
      zoomOverlay.onclick = (e) => {
        if (e.target === zoomOverlay) zoomOverlay.remove();
      };
      const wrap = el("div", { style: "display:flex;flex-direction:column;align-items:center;gap:12px;" }, [
        el("img", { src: cardImg(opt.cardId) }),
        el("div", { style: "display:flex;gap:10px;" }, [
          el("button", { class: "bbl-btn", onclick: () => { zoomOverlay.remove(); onPick(opt.value); } }, "Select"),
          el("button", { class: "bbl-btn ghost", onclick: () => zoomOverlay.remove() }, "Cancel"),
        ]),
      ]);
      zoomOverlay.appendChild(wrap);
      document.body.appendChild(zoomOverlay);
    };
    grid.appendChild(tile);
  }
  return grid;
}

function renderMultiSelect(panel, request, options, finish) {
  const min = request.min ?? request.count ?? 0;
  const max = request.max ?? request.count ?? options.length;
  const selected = new Set();
  const grid = el("div", { class: "choice-options" });

  function refresh() {
    grid.querySelectorAll(".choice-option").forEach((node, i) => {
      node.classList.toggle("selected", selected.has(options[i]));
    });
  }

  options.forEach((opt) => {
    const tile = opt.cardId
      ? el("div", { class: "choice-option" }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })])
      : el("div", { class: "choice-option bbl-btn ghost" }, typeof opt.value === "string" ? opt.value : "Option");
    tile.addEventListener("click", () => {
      if (selected.has(opt)) selected.delete(opt);
      else if (selected.size < max) selected.add(opt);
      refresh();
    });
    grid.appendChild(tile);
  });
  panel.appendChild(grid);

  const confirmBtn = el(
    "button",
    {
      class: "bbl-btn",
      onclick: () => {
        if (selected.size < min) return;
        // Resolve to plain cardId strings when the option represents a card (matches the
        // convention every "discard N cards" effect and the bot's auto-resolver expect),
        // otherwise fall back to whatever raw value the option carried (e.g. instanceIds).
        finish([...selected].map((opt) => opt.cardId ?? opt.value));
      },
    },
    `Confirm (min ${min}${max !== min ? `, max ${max}` : ""})`
  );
  panel.appendChild(confirmBtn);
}
