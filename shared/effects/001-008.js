import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Jan 15 (Assistant Coach): "You may discard up to 2 cards from your hand. If you
// do, search your Discard Pile for as many Banned players as cards you discarded and add
// them to your field."
registerEffect("001-008", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().hand.length > 0 && ctx.searchZone(ctx.self, "discard", (c) => c.name === "Banned").length > 0;
  },
  *resolve(ctx) {
    const maxDiscard = Math.min(2, ctx.player().hand.length);
    const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
    const chosen = yield { type: "CHOOSE_CARDS", prompt: `Discard up to ${maxDiscard} cards from your hand`, options, min: 0, max: maxDiscard };
    const discardedCount = (chosen || []).length;
    for (const cardId of chosen || []) ctx.discardFromHandById(ctx.self, cardId);
    if (discardedCount === 0) return;

    let remaining = discardedCount;
    while (remaining > 0) {
      const banned = ctx.searchZone(ctx.self, "discard", (c) => c.name === "Banned");
      if (banned.length === 0) break;

      let slot = ctx.findEmptySlot(ctx.self);
      if (slot === -1) {
        // Field is full - let the player pick an existing player to swap out for the
        // Banned, or decline (any still-unretrieved Banned(s) just stay in the discard).
        const replaceOptions = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
        const targetInstanceId = yield {
          type: "CHOOSE_OWN_PLAYER",
          prompt: "Your field is full - swap out which player for the Banned?",
          options: replaceOptions,
          allowNone: true,
          cancelLabel: "Don't add another Banned",
        };
        if (!targetInstanceId) break;
        const replaceSlot = ctx.player().playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
        ctx.discardFieldSlot(ctx.self, replaceSlot);
        slot = replaceSlot;
      }

      const pick = banned.length === 1 ? banned[0] : yield { type: "CHOOSE_DISCARD_CARD", prompt: "Add which Banned to your field?", options: banned };
      ctx.playFreeToField(ctx.self, pick.cardId, slot, "discard");
      remaining -= 1;
    }
  },
});
