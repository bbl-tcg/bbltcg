# Rules interpretation notes

Running list of places where the source rules text, the Setlist doc, and/or the printed
card art disagreed, or where a rule was under-specified and I had to make a call. Flag
any of these to me if I guessed wrong and I'll change it — nothing here is final.

1. **Card 001-001 (Deck Sphera) Speed**: Setlist doc says `Slow`, printed card art says
   `FAST`. Using the Setlist doc value (per your instruction to trust the doc and flag
   mismatches as found). Worth a spot-check pass on the physical card set later.

2. **Assistant Coach "Specialty" field**: the rules text says Assistant Coaches have a
   specialty like Head Coaches, but none of the 24 Assistant Coach rows in the Setlist
   doc actually have a Specialty value. Importing as `null` for all of them — cosmetic
   only, doesn't affect gameplay.

3. **Head Coach specialty values**: only `Offense`, `Defense`, `Roster Building` appear
   in this set. The rules text also mentions `Clutch Strategist` as a possible value —
   it just isn't used by any card in BBLTCG-001. No action needed unless a future card
   uses it.

4. **Events have no Month in the data**, even though the deckbuilding rules say "every
   player, star player, event, and assistant coach in a deck must match the month
   belonging to the head coach." All 20 Event cards lack a Month field, and the same
   event IDs (001-097, 001-098, etc.) appear in *every* one of the 4 starter decks
   regardless of the deck's month. Treating Events as month-unlocked/universal (usable
   in any deck) since that's what the actual data implies. Players, Star Players, and
   Assistant Coaches remain month-locked to the Head Coach as written.

5. **PLAYERSCORE UP! deck size: 5 vs 8.** The rules text is internally inconsistent:
   the card-type description says "only 8 PLAYERSCORE UP! cards are allowed in a deck,"
   but the deckbuilding section says "5 PLAYERSCORE UP! cards are needed in every deck,"
   and the setup section says the PS Deck starts with 5 (matching the "5 by your 5th
   turn" turn-structure math). Implementing deckbuilding as requiring **exactly 5**
   PLAYERSCORE UP! cards, since three separate places agree on 5 and only one says 8.
   If you actually want deck construction to allow up to 8, let me know and I'll change
   the legality check.

6. **Full-slot replacement choice.** When a 4th Player/Star Player is played with all 3
   slots full, the rules say one existing player is discarded and replaced but don't say
   who chooses which one. Implementing this as the acting player's choice (a UI prompt),
   since no other rule is given.

7. **Playing a 2nd Star Player while one is already in play.** Treating this as simply
   illegal (the play is blocked) rather than auto-replacing the existing Star Player,
   since the "only 1 Star Player on the field" rule is worded differently from the
   generic 3-slot overflow-replace rule and doesn't mention a replacement mechanism.

8. **Cards with `trigger: null` that describe a reactive action, not a passive stat.**
   A few cards (e.g. LeBall James: "If one of your players is KOed, search your discard
   pile for any card and add it to your hand") have no trigger in the Setlist doc, but
   their text clearly describes something that *happens* in reaction to a game event,
   not a continuously-computed stat modifier like Chef Luis's attack immunity. These are
   implemented as automatic ON_KO-style effects internally (engine-only distinction, not
   shown to players any differently) rather than left inert, since a null trigger with an
   action verb ("search," "discard," "move") can't sensibly be a no-op.

9. **Cross-turn/cross-Recover Health and stat changes rely on natural Recover resets
   instead of explicit "undo" bookkeeping** wherever the stated expiry point (the current
   turn's End Phase, or a specific player's next End Phase) is guaranteed to land at or
   before that player's own next Recover phase — which unconditionally resets their field
   to full Health regardless. This is called out inline in the affected effect files
   (Save/Rebound/Stun/Miguel Borja/Ballex Pereira) rather than repeated here card-by-card.
   The one case where the expiry genuinely outlives the next Recover on either side (Coach
   Cap's Health swap, "until your opponent's next End Phase") does use explicit reversal
   bookkeeping (`healthReversion` on the buff, applied by turn.js's end-of-turn sweep).
