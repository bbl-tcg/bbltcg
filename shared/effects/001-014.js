import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { redirectAttackEffect } from "./_helpers.js";

// Silvia Snipes (Star Player).
// Main (OPPONENTS_TURN): "If this player has not yet attacked in this game, you may
// discard 1 card from your hand. If you do, this player gains [SACRIFICE] until your
// opponent's End Phase."
// Star Power (CLUTCH, WHILE_ATTACKING): "If this player is the only player on your
// field, it can attack twice."
registerStarPlayerEffect(
  "001-014",
  {
    trigger: TRIGGER.OPPONENTS_TURN,
    canActivate(ctx) {
      return !ctx.state.turnFlags.attackedThisGameByInstance[ctx.source.instanceId] && ctx.player().hand.length > 0;
    },
    *resolve(ctx) {
      const options = ctx.player().hand.map((cardId, handIndex) => ({ cardId, handIndex, card: ctx.card(cardId) }));
      const chosen = yield { type: "CHOOSE_HAND_CARD_OPTIONAL", prompt: "Discard 1 card to gain [SACRIFICE]?", options };
      if (!chosen) return;
      ctx.discardFromHandById(ctx.self, chosen.cardId);
      ctx.grantEffect(ctx.source.instanceId, redirectAttackEffect(), { endOfTurn: ctx.state.turnNumber });
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
