import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// LeBall James (Player): "If one of your players is KOed, search your discard pile for
// any card and add it to your hand." The source data lists no trigger for this card, but
// the text describes an automatic reaction to a KO event rather than a passive stat
// modifier, so it's registered as ON_KO with reactsToAnyOwnKo so it also fires when a
// *different* one of your players is KOed (see RULES_NOTES.md).
registerEffect("001-073", {
  trigger: TRIGGER.ON_KO,
  reactsToAnyOwnKo: true,
  canActivate(ctx) {
    return ctx.player().discard.length > 0;
  },
  *resolve(ctx) {
    const options = ctx.player().discard.map((cardId, index) => ({ cardId, index, card: ctx.card(cardId) }));
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_DISCARD_CARD", prompt: "Search your discard pile for any card to add to your hand", options };
    const player = ctx.player();
    const idx = player.discard.indexOf(chosen.cardId);
    if (idx !== -1) {
      player.discard.splice(idx, 1);
      player.hand.push(chosen.cardId);
    }
  },
});
