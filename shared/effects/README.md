# Effect module contract

One file per card id, e.g. `001-001.js`. Each file calls `registerEffect(id, def)` (or
`registerStarPlayerEffect(id, mainDef, starPowerDef)` for Star Players) as a side effect of
being imported. `effects/index.js` imports every file once at startup.

## EffectDef shape

```js
{
  trigger: TRIGGER.YOUR_TURN | null,     // null = always-on static effect, never "activated"
  canActivate(ctx, windowCtx) { ... },   // optional; return false to hide/disable this source
  *resolve(ctx, windowCtx) { ... },      // generator; only for trigger !== null
  staticEffect: { ... },                 // only for trigger === null; hooks read by stats.js
}
```

Every triggered effect is opt-in — per the rulebook, a player always chooses whether to use
an eligible effect, so `canActivate` should only gate *legality* (the "if X" clause), not
whether the player wants to. The choice to activate at all is made by picking this source
out of `getActivatableSources()`'s results; `resolve()` should not re-ask "do you want to?".

## `ctx` (from `effectContext.js`)

`ctx.self` / `ctx.opponent` are player indices; `ctx.source` identifies the card the effect
belongs to (`cardId`, `zone`, `instanceId`/`slot` or `handIndex`). `ctx.player(i = self)`,
`ctx.card(cardId)`, and a grab-bag of action helpers (`draw`, `payCost`, `attachPsUp`,
`dealDamage`, `koSlot`, `discardFieldSlot`, `healCurrent`, `addBuff`, `playFreeToField`,
`millToDiscard`, `searchZone`, `shuffleDeck`, `findInstance`, `scheduleRestoreIfSurvives`,
`log`) — see the file for the full list and add more there as new cards need them.

## Player decisions (`yield`)

`resolve` is a generator. To ask a player something, `yield` a plain descriptor object and
the driver resolves it (a human via UI, or the bot via a heuristic) and resumes the
generator with the answer:

```js
const targetInstanceId = yield { type: "CHOOSE_OWN_PLAYER", prompt: "...", options: [...] };
```

Add `forPlayer: ctx.opponent` to the descriptor when the choice belongs to the *other*
player (e.g. "opponent discards from their hand") — the driver routes it to whichever
player's UI/bot should actually answer; it defaults to the effect's controller when omitted.

## Reusable patterns

Check `_helpers.js` before writing a new file — cards with byte-identical rules text (e.g.
the "may redirect that attack to this player" SACRIFICE ability) should share one factory
rather than being copy-pasted.

## Buffs vs. direct mutation

- Temporary **attack** bonuses (and anything that should disappear at a specific moment):
  `ctx.addBuff(instanceId, { source, attack, expires: { endOfTurn: turnNumber } | "permanent" })`.
  Non-permanent buffs are swept both at the tagged turn's End phase and (as a fallback) at
  the owning player's next Recover phase.
- Temporary **Health** bonuses ("+2 Health until ...End Phase"): use `ctx.healCurrent(id, n)`
  directly. No expiry bookkeeping needed — a player's own Recover phase unconditionally
  resets their field to full Health, and that phase always lands at or before the moment
  these effects are meant to expire.
- **Permanent** max-Health increases: `ctx.addBuff(instanceId, { health: n, expires: "permanent" })`.
