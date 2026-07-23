import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// From 1-5 to Champions, We Are the Ghouls!!! (Event, YOUR_TURN): playable when you have 4
// or more PLAYERSCORE UP! on the field, regardless of what the rest of the field looks
// like. "Rest up to 2 additional active PLAYERSCORE UP! For each one you rest, draw 1 card
// from the top of your Discard Pile."
registerEffect("001-114", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().psField.length >= 4;
  },
  *resolve(ctx) {
    const player = ctx.player();
    // This card itself was just discarded (played from hand, before this resolve() runs)
    // and is sitting on top of the discard pile - it must not count as, or be drawable as,
    // one of the "cards from the top of your Discard Pile" this very effect draws.
    const availableToDraw = player.discard.length - 1;
    const maxCount = Math.min(2, player.psField.filter((p) => p.isActive && !p.attachedTo).length, availableToDraw);
    if (maxCount <= 0) return;
    const count = yield { type: "CHOOSE_NUMBER", prompt: `Rest how many additional PLAYERSCORE UP! (0-${maxCount})? Draw 1 card from your Discard Pile for each.`, min: 0, max: maxCount };
    if (!count) return;
    ctx.payCost(ctx.self, count);
    const self = player.discard.pop();
    for (let i = 0; i < count; i++) {
      if (player.discard.length === 0) break;
      player.hand.push(player.discard.pop());
    }
    player.discard.push(self);
  },
});
