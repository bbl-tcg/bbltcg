import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Yen Durmont (Player, ON_PLAY): "Draw 3 cards from your deck. Put 1 in your hand, and
// discard the rest."
registerEffect("001-019", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    const player = ctx.player();
    const revealed = [];
    for (let i = 0; i < 3 && player.deck.length; i++) revealed.push(player.deck.shift());
    if (revealed.length === 0) return;
    const options = revealed.map((cardId, i) => ({ cardId, i }));
    const keep = options.length === 1 ? options[0] : yield { type: "CHOOSE_REVEALED_CARD", prompt: "Keep which card in your hand?", options };
    revealed.forEach((cardId, i) => {
      if (i === keep.i) player.hand.push(cardId);
      else player.discard.push(cardId);
    });
  },
});
