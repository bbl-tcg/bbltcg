import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Belichick (Head Coach, YOUR_TURN): "Look at the top 3 cards of your deck. Pick 1
// to put at the bottom of your deck, and discard the other 2."
// "While [Coach Stark] is on your field, you cannot use your Coach Belichick effect."
function starkIsBlocking(ctx) {
  const ac = ctx.player().assistantCoach;
  return !!ac && ctx.card(ac.cardId).name === "Coach Stark";
}

registerEffect("001-079", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return !starkIsBlocking(ctx) && ctx.player().deck.length > 0;
  },
  *resolve(ctx) {
    const player = ctx.player();
    const revealed = [];
    for (let i = 0; i < 3 && player.deck.length; i++) revealed.push(player.deck.shift());
    if (revealed.length === 0) return;
    const options = revealed.map((cardId, i) => ({ cardId, i }));
    const keep = options.length === 1 ? options[0] : yield { type: "CHOOSE_REVEALED_CARD", prompt: "Put which card at the bottom of your deck? (the rest are discarded)", options };
    revealed.forEach((cardId, i) => {
      if (i === keep.i) player.deck.push(cardId);
      else player.discard.push(cardId);
    });
  },
});
