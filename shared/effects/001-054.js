import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// JanJan (Star Player).
// Main (YOUR_TURN): "If this player has not yet attacked in this game, you may discard 1
// card from your hand. If you do, draw 5 cards from the top of your deck. If you find a
// Xander Diamond, add it to your field and put the other 4 cards at the bottom of your
// deck." (Cards revealed but not found go to the bottom of the deck the same way.)
// Star Power (CLUTCH, WHILE_ATTACKING): "If this player is the only player on your
// field, it can attack twice."
registerStarPlayerEffect(
  "001-054",
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && ctx.player().hand.length > 0;
    },
    *resolve(ctx) {
      const handOptions = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex }));
      const chosen = handOptions.length === 1 ? handOptions[0] : yield { type: "CHOOSE_HAND_CARD", prompt: "Discard which card to dig 5 cards deep for a Xander Diamond?", options: handOptions };
      ctx.discardFromHandById(ctx.self, chosen.cardId);

      const player = ctx.player();
      const revealed = [];
      for (let i = 0; i < 5 && player.deck.length; i++) revealed.push(player.deck.shift());

      const diamondIndexes = revealed.map((cardId, i) => ({ cardId, i })).filter((e) => ctx.card(e.cardId).name === "Xander Diamond");
      let placed = null;
      if (diamondIndexes.length > 0) {
        const slot = ctx.findEmptySlot(ctx.self);
        if (slot !== -1) {
          const pick = diamondIndexes.length === 1 ? diamondIndexes[0] : yield { type: "CHOOSE_REVEALED_CARD", prompt: "Which Xander Diamond to add to your field?", options: diamondIndexes };
          const inst = ctx.placeCardOnField(ctx.self, revealed[pick.i], slot);
          if (inst) placed = pick.i;
        }
      }

      revealed.forEach((cardId, i) => {
        if (i !== placed) player.deck.push(cardId);
      });
    },
  },
  {
    trigger: TRIGGER.WHILE_ATTACKING,
    canActivate(ctx, windowCtx) {
      if (ctx.player().playerSlots.filter((s) => s).length !== 1) return false;
      const self = ctx.findInstance(windowCtx.attackerInstanceId);
      return !!self && self.instance.extraAttacksGrantedThisTurn === 0 && !self.instance.hasAttackedThisTurn;
    },
    *resolve(ctx, windowCtx) {
      const inst = ctx.findInstance(windowCtx.attackerInstanceId);
      if (inst) inst.instance.extraAttacksGrantedThisTurn += 1;
    },
  }
);
