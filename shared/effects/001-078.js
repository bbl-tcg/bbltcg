import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { synergySearchEventEffect } from "./_helpers.js";

// Justin Wells (Star Player).
// Main (YOUR_TURN): "If this player has not yet attacked in this game, you may discard 1
// Event from your hand. If you do, search your discard pile for 1 player and add it to
// your hand."
// Star Power (SYNERGY, YOUR_TURN): "If Tessa Sparks is on your field, search your
// discard pile for an Event and add it to your hand."
function eventHandOptions(ctx) {
  return ctx
    .player()
    .hand.map((cardId, handIndex) => ({ cardId, handIndex, card: ctx.card(cardId) }))
    .filter((e) => e.card.type === "Event");
}

registerStarPlayerEffect(
  "001-078",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && eventHandOptions(ctx).length > 0;
    },
    *resolve(ctx) {
      const options = eventHandOptions(ctx);
      const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Discard which Event from your hand?", options };
      ctx.discardFromHandById(ctx.self, chosen.cardId);

      const players = ctx.searchZone(ctx.self, "discard", (c) => c.type === "Player" || c.type === "StarPlayer");
      if (players.length === 0) return;
      const pick = players.length === 1 ? players[0] : yield { type: "CHOOSE_DISCARD_CARD", prompt: "Search your discard pile for 1 player to add to your hand", options: players };
      const player = ctx.player();
      const idx = player.discard.indexOf(pick.cardId);
      if (idx !== -1) {
        player.discard.splice(idx, 1);
        player.hand.push(pick.cardId);
      }
    },
  },
  synergySearchEventEffect(TRIGGER.YOUR_TURN, "Tessa Sparks")
);
