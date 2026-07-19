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
    if (request.pendingDamage != null) {
      panel.appendChild(el("div", { style: "font-weight:700;color:var(--bbl-red);" }, `Incoming damage: ${request.pendingDamage}`));
    }
    // Which of your own players is actually under attack right now - shown at the "pick a
    // reaction card, or pass" step too (not just the later "apply it to which player?" step)
    // since that's the moment the decision to react at all actually gets made.
    if (request.threatenedCardId) {
      panel.appendChild(
        el("div", { style: "display:flex;align-items:center;gap:8px;justify-content:center;" }, [
          el("img", { src: cardImg(request.threatenedCardId), style: "width:44px;border-radius:4px;border:1.5px solid var(--bbl-black);" }),
          el("div", { style: "font-weight:700;color:var(--bbl-text);" }, `${getCard(request.threatenedCardId).name}: ${request.threatenedCurrentHealth}/${request.threatenedMaxHealth} HP`),
        ])
      );
    }

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
    } else if (request.type === "MULLIGAN_PROMPT") {
      // Shows the actual opening hand's card art (each zoomable, per "let me see the real
      // cards before deciding") rather than a text list of names, then the Mulligan/Keep
      // decision below it.
      const cardIds = request.cardIds || [];
      const grid = el("div", { class: "choice-options" });
      for (const cardId of cardIds) {
        grid.appendChild(
          el("div", { class: "choice-option", onclick: () => showCardZoomWithActions(cardId, []) }, [el("img", { src: cardImg(cardId), alt: getCard(cardId).name })])
        );
      }
      panel.appendChild(grid);
      panel.appendChild(
        el("div", { style: "display:flex;gap:10px;justify-content:center;" }, [
          el("button", { class: "bbl-btn", onclick: () => finish(true) }, "Mulligan"),
          el("button", { class: "bbl-btn secondary", onclick: () => finish(false) }, "Keep"),
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
    if (o && o.__enrichedInstance) {
      return {
        cardId: o.cardId,
        label: getCard(o.cardId).name,
        value: o.instanceId,
        threatened: !!o.threatened,
        currentHealth: o.currentHealth,
        maxHealth: o.maxHealth,
      };
    }
    if (typeof o === "string") {
      const label = requestType === "CHOOSE_PS_UP" ? "PS UP" : null;
      return { cardId: null, instanceId: o, label, value: o };
    }
    if (o.cardId) return { cardId: o.cardId, label: getCard(o.cardId).name, value: o };
    return { cardId: null, instanceId: o, label: null, value: o };
  });
}

/** A small "current/max" HP chip overlaid on a choice tile - only rendered when the option
 * was health-enriched (own/opponent-player picks), so callers with plain cardId options
 * (e.g. hand-card choices) are unaffected. */
function hpBadge(opt) {
  if (opt.currentHealth == null || opt.maxHealth == null) return null;
  return el("div", { class: "choice-option-hp" }, `${opt.currentHealth}/${opt.maxHealth} HP`);
}

function buildCardOptionGrid(options, onPick) {
  const grid = el("div", { class: "choice-options" });
  for (const opt of options) {
    if (opt.cardId) {
      const tile = el("div", { class: `choice-option${opt.threatened ? " threatened" : ""}`, onclick: () => onPick(opt.value) }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })]);
      const badge = hpBadge(opt);
      if (badge) tile.appendChild(badge);
      grid.appendChild(tile);
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
    const tile = el("div", { class: `choice-option${opt.threatened ? " threatened" : ""}` }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })]);
    const badge = hpBadge(opt);
    if (badge) tile.appendChild(badge);
    tile.onclick = () => {
      const zoomOverlay = el("div", { class: "card-zoom-overlay" });
      zoomOverlay.onclick = (e) => {
        if (e.target === zoomOverlay) zoomOverlay.remove();
      };
      const wrap = el("div", { style: "display:flex;flex-direction:column;align-items:center;gap:12px;" }, [
        el("img", { src: cardImg(opt.cardId) }),
        badge ? el("div", { style: "font-weight:700;color:var(--bbl-blue);" }, `${opt.currentHealth}/${opt.maxHealth} HP`) : null,
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
  // CHOOSE_TWO_OWN_PLAYERS is always exactly 2 by definition (Coach Ale, Coach Cap) - the
  // effects that yield it don't bother passing min/max/count themselves, so default it here
  // rather than falling through to the generic 0..options.length range below (which let a
  // player confirm with 0, 1, or 3+ selected and crash/no-op the effect on resolve).
  const isExactlyTwo = request.type === "CHOOSE_TWO_OWN_PLAYERS";
  const min = request.min ?? request.count ?? (isExactlyTwo ? 2 : 0);
  const max = request.max ?? request.count ?? (isExactlyTwo ? 2 : options.length);
  const selected = new Set();
  const grid = el("div", { class: "choice-options" });

  function refresh() {
    grid.querySelectorAll(".choice-option").forEach((node, i) => {
      node.classList.toggle("selected", selected.has(options[i]));
    });
  }

  options.forEach((opt) => {
    const tile = opt.cardId
      ? el("div", { class: `choice-option${opt.threatened ? " threatened" : ""}` }, [el("img", { src: cardImg(opt.cardId), alt: opt.label || "" })])
      : el("div", { class: "choice-option bbl-btn ghost" }, typeof opt.value === "string" ? opt.value : "Option");
    if (opt.cardId) {
      const badge = hpBadge(opt);
      if (badge) tile.appendChild(badge);
    }
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
        // CHOOSE_OPPONENT_PLAYERS/CHOOSE_TWO_OWN_PLAYERS pick specific *field instances*
        // (ctx.findInstance(instanceId) on the effect side) - resolving those to the card id
        // instead would collide whenever two of the same card are on the field, and never
        // match at all since options.value already *is* the instanceId. CHOOSE_CARDS options
        // are hand cards instead, where every other "discard N cards" effect and the bot's
        // auto-resolver expect plain cardId strings back.
        const useInstanceId = request.type === "CHOOSE_OPPONENT_PLAYERS" || request.type === "CHOOSE_TWO_OWN_PLAYERS";
        finish([...selected].map((opt) => (useInstanceId ? opt.value : opt.cardId ?? opt.value)));
      },
    },
    `Confirm (min ${min}${max !== min ? `, max ${max}` : ""})`
  );
  panel.appendChild(confirmBtn);
}
