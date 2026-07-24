import { el } from "../screens.js";
import { getCard } from "/shared/engine/cardDb.js";
import { effectiveAttack, effectiveHealth, isStarPlayerInPowerUpTurns, isStunned } from "/shared/engine/stats.js";

const CARD_BACK = "/assets/cards/back.png";
const PS_UP_FRONT = "/assets/cards/playerscoreup.png";

function cardImg(cardId) {
  return `/${getCard(cardId).image}`;
}

/**
 * Renders both fields + hands into `container` for `state`, from `viewerIndex`'s
 * perspective (viewer's own field/hand on the bottom, opponent mirrored on top).
 * `handlers` = { onHandCardClick(handIndex), onFieldCardClick(playerIndex, slot),
 * onDiscardClick(playerIndex), onDeckClick(playerIndex) }.
 */
export function renderBoard(container, state, viewerIndex, handlers) {
  container.innerHTML = "";
  const opponentIndex = viewerIndex === 0 ? 1 : 0;

  const fieldsWrap = el("div", { class: "fields-wrap" });
  fieldsWrap.appendChild(renderOpponentArea(state, opponentIndex, handlers));
  fieldsWrap.appendChild(renderPlayerArea(state, viewerIndex, opponentIndex, handlers));
  container.appendChild(fieldsWrap);
  container.appendChild(renderHandBar(state, viewerIndex, handlers));
}

function renderOpponentArea(state, playerIndex, handlers) {
  const area = el("div", { class: "opponent-area" });
  // A separate absolutely-positioned layer for the playmat background (set from
  // applyPlaymats() in localMatch.js/multiplayerMatch.js) rather than a background-image on
  // .opponent-area itself, so it alone can be rotated 180deg to face the opponent - matching
  // .field-grid.mirrored's own 180deg rotation - without also flipping the field contents,
  // which get their rotation independently from that class.
  area.appendChild(el("div", { class: "playmat-bg opponent-playmat-bg" }));
  const player = state.players[playerIndex];
  // Multiplayer sends a redacted view of the opponent (hand contents hidden, just a
  // count) - `handCount` is present there; local/bot play always has the real array.
  const handCount = player.handCount ?? player.hand.length;
  const fan = el("div", { class: "opponent-hand-fan" });
  for (let i = 0; i < handCount; i++) {
    fan.appendChild(el("div", { class: "mini-card-back", style: `background-image:url(${CARD_BACK});` }));
  }
  area.appendChild(fan);
  area.appendChild(countBadge(handCount, { position: "absolute", top: "2px", left: "50%", transform: "translateX(60px)" }));
  area.appendChild(renderFieldGrid(state, playerIndex, handlers, true));
  return area;
}

function renderPlayerArea(state, playerIndex, opponentIndex, handlers) {
  const area = el("div", { class: "player-area" });
  area.appendChild(el("div", { class: "playmat-bg" }));
  area.appendChild(renderFieldGrid(state, playerIndex, handlers, false));
  return area;
}

/** Sits directly on top of a Deck/PS Deck/Score/Discard card-back, in the corner - see
 * .count-badge in board.css. */
function countBadge(count) {
  return el("div", { class: "bbl-badge count-badge" }, String(count));
}

/** A small always-on caption identifying what a sector is (Score, Deck, PS Field, ...) -
 * counter-rotated for the opponent's mirrored board so the text itself still reads upright
 * even though the whole grid (and this label along with it) is flipped 180deg. */
function sectorLabel(text, mirrored) {
  return el("div", { class: "sector-label", style: mirrored ? "transform:rotate(180deg);" : "" }, text);
}

function renderFieldGrid(state, playerIndex, handlers, mirrored) {
  const player = state.players[playerIndex];
  const grid = el("div", { class: `field-grid${mirrored ? " mirrored" : ""}` });

  // Row 1, left: Score - shown as a single face-down card (like Deck/PS Deck) with the true
  // count on a badge, rather than up to 2 separate slots, so it stays legible at small sizes.
  const scoreSector = el("div", { class: "sector sector-score" });
  scoreSector.appendChild(sectorLabel("Score", mirrored));
  const totalScore = player.scoreCount ?? player.score.length;
  if (totalScore > 0) {
    scoreSector.appendChild(
      el("div", { class: "slot" }, [el("div", { class: "card-face", style: `background-image:url(${CARD_BACK});cursor:default;` }), countBadge(totalScore)])
    );
  }
  grid.appendChild(scoreSector);

  // Row 1, center: Head Coach, then the 3 player slots, then Assistant Coach - flanking the
  // players rather than sitting in their own row below, now that the field is 2 rows instead
  // of 3 (see rulebook.js's fieldDiagram(), which must stay in sync with this).
  const playersSector = el("div", { class: "sector sector-players" });
  playersSector.appendChild(sectorLabel("Field", mirrored));
  playersSector.appendChild(renderCoachSlot(playerIndex, "HEAD_COACH", player.headCoach.cardId, handlers));
  const playerGroup = el("div", { class: "player-slot-group" });
  player.playerSlots.forEach((inst, slot) => {
    playerGroup.appendChild(renderFieldCardSlot(state, playerIndex, slot, inst, handlers));
  });
  playersSector.appendChild(playerGroup);
  playersSector.appendChild(
    player.assistantCoach
      ? renderCoachSlot(playerIndex, "ASSISTANT_COACH", player.assistantCoach.cardId, handlers)
      : el("div", { class: "slot coach-slot" })
  );
  grid.appendChild(playersSector);

  // Row 1, right: Deck
  const deckSector = el("div", { class: "sector sector-deck" });
  deckSector.appendChild(sectorLabel("Deck", mirrored));
  const deckCount = player.deckCount ?? player.deck.length;
  if (deckCount > 0) {
    deckSector.appendChild(
      el("div", { class: "slot" }, [el("div", { class: "card-face", style: `background-image:url(${CARD_BACK});cursor:default;` }), countBadge(deckCount)])
    );
  }
  grid.appendChild(deckSector);

  // Row 2, left: PS Deck
  const psDeckSector = el("div", { class: "sector sector-psdeck" });
  psDeckSector.appendChild(sectorLabel("PS Deck", mirrored));
  if (player.psDeckCount > 0) {
    psDeckSector.appendChild(
      el("div", { class: "slot" }, [el("div", { class: "card-face", style: `background-image:url(${CARD_BACK});cursor:default;` }), countBadge(player.psDeckCount)])
    );
  }
  grid.appendChild(psDeckSector);

  // Row 2, center: PS Field (8 slots)
  const psFieldSector = el("div", { class: "sector sector-psfield" });
  psFieldSector.appendChild(sectorLabel("PS Field", mirrored));
  for (const psUp of player.psField) {
    if (psUp.attachedTo) continue; // shown under its owner instead
    psFieldSector.appendChild(
      el("div", { class: `ps-up-slot${psUp.isActive ? "" : " rested"}` }, [
        el("div", { class: "card-face", style: `background-image:url(${PS_UP_FRONT});cursor:default;` }),
      ])
    );
  }
  grid.appendChild(psFieldSector);

  // Row 2, right: Discard - the count badge always shows (even at 0) so both players can
  // see it at a glance; the clickable top-card face only appears once there's a card to show.
  const discardSector = el("div", { class: "sector sector-discard" });
  discardSector.appendChild(sectorLabel("Discard", mirrored));
  if (player.discard.length > 0) {
    const topCardId = player.discard[player.discard.length - 1];
    discardSector.appendChild(
      el("div", { class: "slot" }, [
        el("div", {
          class: "card-face",
          style: `background-image:url(${cardImg(topCardId)});`,
          onclick: () => handlers.onDiscardClick?.(playerIndex),
        }),
        countBadge(player.discard.length),
      ])
    );
  } else {
    // No card to overlay the badge onto - show the (0) count floating in the empty sector,
    // same as before, so both players can still see the discard pile is empty at a glance.
    discardSector.appendChild(countBadge(0));
  }
  grid.appendChild(discardSector);

  return grid;
}

/** Head Coach/Assistant Coach card face flanking the 3 player slots - a smaller `.coach-slot`
 * variant of the regular `.slot` (see board.css) since they're secondary to the players. */
function renderCoachSlot(playerIndex, zone, cardId, handlers) {
  return el("div", { class: "slot coach-slot" }, [
    el("div", {
      class: "card-face",
      style: `background-image:url(${cardImg(cardId)});`,
      onclick: () => handlers.onCoachClick?.(playerIndex, zone, cardId),
    }),
  ]);
}

function renderFieldCardSlot(state, playerIndex, slot, inst, handlers) {
  const wrap = el("div", { class: "slot" });
  if (!inst) return wrap;
  const card = getCard(inst.cardId);
  const attack = effectiveAttack(state, playerIndex, inst);
  const health = effectiveHealth(inst);
  const isPowerUp = isStarPlayerInPowerUpTurns(inst, state.turnNumber);
  const stunned = isStunned(inst);

  const classes = ["card-face"];
  if (handlers.attackableInstanceIds?.has(inst.instanceId)) classes.push("attackable");
  if (handlers.targetableInstanceIds?.has(inst.instanceId)) classes.push("targetable");
  if (stunned) classes.push("stunned");

  const face = el(
    "div",
    {
      class: classes.join(" "),
      style: `background-image:url(/${card.image});`,
      title: `${card.name}${isPowerUp ? " (Power Up Turn)" : ""}${stunned ? " (Cannot attack)" : ""}`,
      "data-instance-id": inst.instanceId,
      "data-player-index": String(playerIndex),
      onclick: () => handlers.onFieldCardClick?.(playerIndex, slot, inst),
    },
    [
      el("div", { class: "health-pill" }, String(health)),
      el("div", { class: "attack-pill" }, String(attack)),
      el("div", { class: "cost-pill" }, String(card.cost)),
      ...(inst.attachedPsUp.length ? [psAttachBadge(inst.attachedPsUp.length)] : []),
      ...(stunned ? [stunBadge()] : []),
    ]
  );
  wrap.appendChild(face);
  return wrap;
}

function stunBadge() {
  return el("div", { class: "stun-badge", title: "Cannot attack" }, "\u{1F6AB}");
}

function psAttachBadge(count) {
  return el(
    "div",
    {
      style:
        "position:absolute;top:2px;right:2px;background:var(--bbl-blue);color:white;border:1.5px solid black;border-radius:999px;font-size:0.6rem;font-weight:800;padding:0 4px;",
    },
    `+${count}`
  );
}

function renderHandBar(state, viewerIndex, handlers) {
  const bar = el("div", { class: "player-hand-bar" });
  const player = state.players[viewerIndex];
  player.hand.forEach((cardId, handIndex) => {
    const card = getCard(cardId);
    bar.appendChild(
      el("div", { class: "hand-card" }, [
        el("div", {
          class: "card-face",
          style: `background-image:url(/${card.image});`,
          "data-hand-index": String(handIndex),
          onclick: () => handlers.onHandCardClick?.(handIndex, cardId),
        }),
      ])
    );
  });
  const badge = countBadge(player.hand.length, { position: "absolute", top: "4px", left: "4px" });
  bar.style.position = "relative";
  bar.appendChild(badge);
  return bar;
}

export { cardImg, CARD_BACK };
