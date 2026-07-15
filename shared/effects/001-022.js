import { registerStarPlayerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Joao (Star Player).
// Main (static): "You may attach PLAYERSCORE UP! cards to this player." (Unlocks normal
// PS UP attachment for this specific Star Player, per engine.js's attachPsUpAction check.)
// Star Power (THE RIGHT WAY, YOUR_TURN): "If 1 PLAYERSCORE UP! is attached to this Joao,
// you may attach 2 rested PLAYERSCORE UP! to another player on your field."
registerStarPlayerEffect(
  "001-022",
  {
    trigger: null,
    staticEffect: { allowsNormalPsUpAttachment: true },
  },
  {
    trigger: TRIGGER.YOUR_TURN,
    canActivate(ctx) {
      const self = ctx.findInstance(ctx.source.instanceId);
      if (!self || self.instance.attachedPsUp.length !== 1) return false;
      const restedCount = ctx.player().psField.filter((p) => !p.isActive && !p.attachedTo).length;
      const otherPlayers = ctx.player().playerSlots.some((s) => s && s.instanceId !== ctx.source.instanceId);
      return restedCount >= 2 && otherPlayers;
    },
    *resolve(ctx) {
      const otherOptions = ctx.player().playerSlots.filter((s) => s && s.instanceId !== ctx.source.instanceId).map((s) => s.instanceId);
      const targetInstanceId = otherOptions.length === 1 ? otherOptions[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Attach 2 rested PLAYERSCORE UP! to which other player?", options: otherOptions };
      for (let i = 0; i < 2; i++) {
        const rested = ctx.player().psField.filter((p) => !p.isActive && !p.attachedTo);
        if (rested.length === 0) break;
        ctx.attachPsUpForced(ctx.self, rested[0].id, targetInstanceId);
      }
    },
  }
);
