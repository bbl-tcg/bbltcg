import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Greatest Roster Ever!!! How Can We Lose? (Event, YOUR_TURN): "Search your Discard Pile
// for a Tier 3 player and add it to your hand."
registerEffect("001-116", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.searchZone(ctx.self, "discard", (c) => (c.type === "Player" || c.type === "StarPlayer") && c.tier === 3).length > 0;
  },
  *resolve(ctx) {
    const options = ctx.searchZone(ctx.self, "discard", (c) => (c.type === "Player" || c.type === "StarPlayer") && c.tier === 3);
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_DISCARD_CARD", prompt: "Search your discard pile for which Tier 3 player?", options };
    const player = ctx.player();
    const idx = player.discard.indexOf(chosen.cardId);
    if (idx !== -1) {
      player.discard.splice(idx, 1);
      player.hand.push(chosen.cardId);
    }
  },
});
