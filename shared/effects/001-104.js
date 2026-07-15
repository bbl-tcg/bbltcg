import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Starting Lineup (Event, YOUR_TURN): "Search your deck for a STAR Player and add it to
// your hand. Then, shuffle your deck."
registerEffect("001-104", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.searchZone(ctx.self, "deck", (c) => c.type === "StarPlayer").length > 0;
  },
  *resolve(ctx) {
    const options = ctx.searchZone(ctx.self, "deck", (c) => c.type === "StarPlayer");
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_DECK_CARD", prompt: "Search your deck for which Star Player?", options };
    const player = ctx.player();
    const idx = player.deck.indexOf(chosen.cardId);
    if (idx !== -1) {
      player.deck.splice(idx, 1);
      player.hand.push(chosen.cardId);
    }
    ctx.shuffleDeck(ctx.self);
  },
});
