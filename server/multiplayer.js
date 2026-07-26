import { initializeGame, drawOpeningHand, mulligan, keepHand, drawScoreCards, playOpeningCard, drawSecondPlayerBonusCard, rollForFirstPick, setFirstPlayer, isEligibleForOpeningField } from "../shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "../shared/engine/turn.js";
import * as engine from "../shared/engine/engine.js";
import { makeRng } from "../shared/engine/rng.js";
import { validateDeck } from "../shared/engine/deckLegality.js";
import { PS_DECK_SIZE } from "../shared/engine/constants.js";
import * as db from "./db/index.js";

/** The client already blocks starting/joining with an illegal deck, but a room is a
 * real multiplayer match affecting another player - re-check here too rather than trusting
 * a stale client build or a hand-crafted socket payload. */
function isLegalDeck(deck) {
  return !!deck && validateDeck({ headCoachId: deck.headCoachId, mainDeck: deck.mainDeck, psDeckCount: deck.psDeckCount ?? PS_DECK_SIZE }).legal;
}

// A player's own turn (from startTurn to End Turn, including whatever they do mid-turn) has
// a 2.5-minute clock; running it out force-ends the turn. Two run-outs in a row (no normal
// end-turn in between) is an automatic loss - see Room#waitForTurnActions.
const TURN_TIME_MS = 2.5 * 60 * 1000;

const rooms = new Map(); // code -> Room

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

/** Strips information the *other* player shouldn't see: hand contents (count only), deck
 * order/contents (count only), Score identities (count only). Each player gets their own
 * differently-redacted copy. */
function redactStateFor(state, viewerIndex) {
  const clone = JSON.parse(JSON.stringify(state, (key, value) => (key === "rng" ? undefined : value)));
  clone.players.forEach((player, i) => {
    if (i === viewerIndex) return;
    player.handCount = player.hand.length;
    player.hand = [];
    player.deckCount = player.deck.length;
    player.deck = [];
    player.scoreCount = player.score.length;
    player.score = [];
  });
  clone.players[viewerIndex].handCount = clone.players[viewerIndex].hand.length;
  clone.players[viewerIndex].deckCount = clone.players[viewerIndex].deck.length;
  clone.players[viewerIndex].scoreCount = clone.players[viewerIndex].score.length;
  return clone;
}

class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.sockets = [null, null]; // socket per playerIndex
    this.userIds = [null, null];
    this.ready = false;
    this.consecutiveTimeouts = [0, 0]; // per playerIndex - reset on a voluntary endTurn
    this.turnTimer = null;
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  broadcastState() {
    // Playmats are cosmetic-only and never touch the engine's own state (createPlayerState
    // only destructures the fields it actually knows about) - sent as a sibling of `state`
    // instead, sourced from the room's own un-redacted deck objects (this.decks), which are
    // never subject to redactStateFor()'s hiding of opponent info in the first place.
    const playmats = [this.decks[0]?.playmatUrl ?? null, this.decks[1]?.playmatUrl ?? null];
    for (let i = 0; i < 2; i++) {
      if (this.sockets[i]) this.sockets[i].emit("state-update", { state: redactStateFor(this.state, i), you: i, playmats });
    }
  }

  /** Sends a choice request to whichever player actually owns it and awaits their answer
   * over the socket; falls back to a safe default if that player has disconnected. Also
   * tells the OTHER player a decision is pending (see peer-deciding below) so their client
   * can block further actions until it resolves - without this, an attacker could keep
   * attacking with other players while their first attack's reactive choice (e.g. Sainz's
   * discard-to-negate) is still awaiting the defender, stacking choice overlays on both
   * sides as the resulting windows pile up out of order. */
  resolveChoice = (request) => {
    return new Promise((resolve) => {
      const forPlayer = request.forPlayer ?? request.__controllerIndex ?? 0;
      const sock = this.sockets[forPlayer];
      if (!sock) return resolve(null);
      const otherSock = this.sockets[forPlayer === 0 ? 1 : 0];
      otherSock?.emit("peer-deciding", true);
      sock.emit("choice-request", request, (answer) => {
        otherSock?.emit("peer-deciding", false);
        resolve(answer);
      });
    });
  };

  decideWindow = (controllerIndex, available, windowCtx) => {
    if (available.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const sock = this.sockets[controllerIndex];
      if (!sock) return resolve(null);
      const otherSock = this.sockets[controllerIndex === 0 ? 1 : 0];
      const options = available.map((s) => ({ cardId: s.cardId, zone: s.zone, instanceId: s.instanceId, handIndex: s.handIndex, label: s.label }));
      otherSock?.emit("peer-deciding", true);
      sock.emit("window-request", { options, windowCtx }, (chosenOption) => {
        otherSock?.emit("peer-deciding", false);
        if (!chosenOption) return resolve(null);
        const match = available.find(
          (s) => s.cardId === chosenOption.cardId && s.zone === chosenOption.zone && s.label === chosenOption.label && (s.zone === "HAND" ? s.handIndex === chosenOption.handIndex : s.instanceId === chosenOption.instanceId)
        );
        resolve(match || null);
      });
    });
  };

  async runSetup() {
    const rng = makeRng(Date.now() % 1e9);
    this.state = initializeGame({
      playerADef: { id: "A", name: "Player A", ...this.decks[0] },
      playerBDef: { id: "B", name: "Player B", ...this.decks[1] },
      rng,
    });

    drawOpeningHand(this.state, 0, rng);
    drawOpeningHand(this.state, 1, rng);
    for (const p of [0, 1]) {
      const wantsMulligan = await this.resolveChoice({ forPlayer: p, type: "MULLIGAN_PROMPT", prompt: "Your hand - mulligan (redraw once)?", cardIds: this.state.players[p].hand });
      if (wantsMulligan) mulligan(this.state, p, rng);
      keepHand(this.state, p);
    }
    drawScoreCards(this.state, 0);
    drawScoreCards(this.state, 1);

    // "In multiplayer mode, one player will be picked at random to decide whether they
    // want to go first or second."
    const decider = Math.floor(rng() * 2);
    const choice = await this.resolveChoice({ forPlayer: decider, type: "CHOOSE_FIRST_OR_SECOND", prompt: "You were picked at random - go first or second?" });
    const firstPlayerIndex = choice === "second" ? (decider === 0 ? 1 : 0) : decider;
    setFirstPlayer(this.state, firstPlayerIndex);

    for (const p of [0, 1]) {
      const candidates = this.state.players[p].hand.map((cardId, handIndex) => ({ cardId, handIndex })).filter((e) => isEligibleForOpeningField(e.cardId));
      const handIndex =
        candidates.length === 1
          ? candidates[0].handIndex
          : (await this.resolveChoice({ forPlayer: p, type: "CHOOSE_HAND_CARD", prompt: "Choose your opening Player (Cost 3 or less)", options: candidates })).handIndex;
      playOpeningCard(this.state, p, handIndex);
    }

    // Balance change: the player going second gets a 2nd guaranteed Cost <= 3 Player,
    // drawn and played to the field for free right alongside their first - see
    // drawSecondPlayerBonusCard's doc comment (setup.js) for why.
    const secondPlayerIndex = firstPlayerIndex === 0 ? 1 : 0;
    drawSecondPlayerBonusCard(this.state, secondPlayerIndex, rng);
    playOpeningCard(this.state, secondPlayerIndex, this.state.players[secondPlayerIndex].hand.length - 1);

    this.broadcastState();
    await this.runTurnLoop();
  }

  async runTurnLoop() {
    while (!this.state.gameOver) {
      startTurn(this.state);
      // Set before broadcastState() so the very first state-update of this turn already
      // carries the real deadline, rather than clients briefly showing a stale one.
      if (!this.state.gameOver) this.state.turnDeadline = Date.now() + TURN_TIME_MS;
      this.broadcastState();
      if (this.state.gameOver) break;
      await this.waitForTurnActions(this.state.activePlayerIndex);
      if (this.state.gameOver) break;
    }
    this.clearTurnTimer();
    this.broadcastState();
    await this.awardResults();
  }

  /** Listens for this player's action events until they end their turn *or* their clock
   * runs out. Timing out twice in a row (no voluntary endTurn action in between) is an
   * automatic loss - see the class-level TURN_TIME_MS comment. */
  waitForTurnActions(activeIndex) {
    const sock = this.sockets[activeIndex];
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.clearTurnTimer();
        this.finishTurnWait = null;
        if (sock) sock.off("game-action", handler);
        resolve();
      };
      // The disconnect handler ends the game immediately on its own (awarding the win to
      // whoever's left) without going through a normal action or this promise at all -
      // without this hook, runTurnLoop would stay stuck awaiting this turn for up to
      // TURN_TIME_MS after the room already knows the game is over.
      this.finishTurnWait = finish;

      const handler = async (action, ack) => {
        try {
          const result = await this.applyAction(activeIndex, action);
          ack?.(result);
          if (action.type === "endTurn") this.consecutiveTimeouts[activeIndex] = 0;
          this.broadcastState();
          if (action.type === "endTurn" || this.state.gameOver) finish();
        } catch (err) {
          ack?.({ ok: false, reason: String(err.message || err) });
        }
      };

      if (!sock) {
        finish();
        return;
      }
      sock.on("game-action", handler);

      this.turnTimer = setTimeout(async () => {
        if (settled || this.state.gameOver) return;
        this.consecutiveTimeouts[activeIndex] += 1;
        if (this.consecutiveTimeouts[activeIndex] >= 2) {
          // Leave awarding results to runTurnLoop's own post-loop call - it always runs
          // once the loop notices gameOver, so awarding here too would double-pay.
          this.state.gameOver = true;
          this.state.winner = activeIndex === 0 ? 1 : 0;
          this.state.winReason = "timeout";
          this.broadcastState();
          finish();
          return;
        }
        await engine.endTurn(this.state, activeIndex, this.resolveChoice, this.decideWindow).catch(() => {});
        this.broadcastState();
        finish();
      }, Math.max(0, this.state.turnDeadline - Date.now()));
    });
  }

  async applyAction(me, action) {
    const resolveChoice = this.resolveChoice;
    const decideWindow = this.decideWindow;
    switch (action.type) {
      case "playCard":
        return engine.playCard(this.state, me, action.handIndex, { replaceSlot: action.replaceSlot ?? null }, resolveChoice);
      case "attack":
        return engine.attack(this.state, { attackerPlayerIndex: me, attackerSlot: action.attackerSlot, targetPlayerIndex: action.targetPlayerIndex, targetSlot: action.targetSlot }, resolveChoice, decideWindow);
      case "activateEffect":
        return engine.activateEffectAction(this.state, me, action.source, action.trigger, {}, resolveChoice);
      case "attachPsUp":
        return engine.attachPsUpAction(this.state, me, action.psUpId, action.targetInstanceId);
      case "endTurn":
        await engine.endTurn(this.state, me, resolveChoice, decideWindow);
        return { ok: true };
      case "concede":
        this.state.gameOver = true;
        this.state.winner = me === 0 ? 1 : 0;
        this.state.winReason = "concede";
        return { ok: true };
      default:
        return { ok: false, reason: "UNKNOWN_ACTION" };
    }
  }

  async awardResults() {
    if (this.state.winner === null || this.state.winner === undefined) return;
    // A loss by conceding, disconnecting, or being timed out gets 0 Pack Points instead of
    // the normal 2 - see the "concede" action, the "disconnect" socket handler, and the
    // 2-consecutive-timeouts branch above, the only three places that set winReason.
    const noPointsReasons = new Set(["concede", "disconnect", "timeout"]);
    const loserGained = noPointsReasons.has(this.state.winReason) ? 0 : 2;
    for (let i = 0; i < 2; i++) {
      const userId = this.userIds[i];
      if (!userId) continue;
      await db.addPackPoints(userId, i === this.state.winner ? 4 : loserGained);
    }
  }
}

export function attachMultiplayer(io) {
  const mp = io.of("/multiplayer");

  mp.on("connection", (socket) => {
    socket.on("create-room", ({ deck, userId }, ack) => {
      if (!isLegalDeck(deck)) return ack?.({ ok: false, reason: "Your deck isn't legal to play with." });
      const code = generateInviteCode();
      const room = new Room(code, mp);
      room.sockets[0] = socket;
      room.userIds[0] = userId || null;
      room.decks = [deck, null];
      rooms.set(code, room);
      socket.data.roomCode = code;
      socket.data.playerIndex = 0;
      ack?.({ ok: true, code });
    });

    socket.on("join-room", ({ code, deck, userId }, ack) => {
      const room = rooms.get(code);
      if (!room) return ack?.({ ok: false, reason: "No room with that invite code." });
      if (room.sockets[1]) return ack?.({ ok: false, reason: "That room is already full." });
      if (!isLegalDeck(deck)) return ack?.({ ok: false, reason: "Your deck isn't legal to play with." });
      room.sockets[1] = socket;
      room.userIds[1] = userId || null;
      room.decks[1] = deck;
      socket.data.roomCode = code;
      socket.data.playerIndex = 1;
      ack?.({ ok: true, code });
      // The creator has been sitting on the "waiting for them to join" room-setup screen -
      // give them a signal to switch over now, since the server won't broadcastState()
      // until the whole setup flow (mulligan, first/second pick, opening card) finishes,
      // and they aren't necessarily the one asked something first.
      room.sockets[0]?.emit("opponent-joined");
      room.runSetup().catch((err) => mp.to(code).emit("room-error", String(err.message || err)));
    });

    // Lets the room creator swap their deck while still waiting for an opponent - rejected
    // once runSetup() has actually consumed the old deck (room.state exists by then), so a
    // change made after the opponent joins is silently ignored rather than corrupting an
    // in-progress match.
    socket.on("update-deck", ({ deck }, ack) => {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room) return ack?.({ ok: false, reason: "No active room." });
      if (room.state) return ack?.({ ok: false, reason: "The match has already started." });
      if (!isLegalDeck(deck)) return ack?.({ ok: false, reason: "Your deck isn't legal to play with." });
      room.decks[socket.data.playerIndex] = deck;
      ack?.({ ok: true });
    });

    socket.on("chat-message", ({ text }) => {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room) return;
      const trimmed = String(text || "").slice(0, 300).trim();
      if (!trimmed) return;
      const otherIndex = socket.data.playerIndex === 0 ? 1 : 0;
      room.sockets[otherIndex]?.emit("chat-message", { text: trimmed });
    });

    // A client that had an active room stored (see multiplayerMatch.js's localStorage use)
    // sends this right after connecting, whether the disconnect was a network blip or a
    // full page reload. Re-associates the new socket with its old seat and immediately
    // pushes the room's current state - if the game already ended while this player was
    // gone (the disconnect handler below awards the win to whoever's left), that state
    // has gameOver/winner set, so the client's normal state-update handling shows the
    // real result instead of leaving a stale pre-disconnect board frozen on screen forever.
    socket.on("rejoin-room", ({ code, playerIndex, userId }, ack) => {
      const room = rooms.get(code);
      if (!room) return ack?.({ ok: false, reason: "That match is no longer available." });
      if (playerIndex !== 0 && playerIndex !== 1) return ack?.({ ok: false, reason: "Invalid seat." });
      room.sockets[playerIndex] = socket;
      if (userId) room.userIds[playerIndex] = userId;
      socket.data.roomCode = code;
      socket.data.playerIndex = playerIndex;
      ack?.({ ok: true });
      if (room.state) room.broadcastState();
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room) return;
      const otherIndex = socket.data.playerIndex === 0 ? 1 : 0;
      room.sockets[otherIndex]?.emit("opponent-disconnected");

      // A game already in progress shouldn't just hang forever waiting on a turn from a
      // player who's gone - award the win to whoever's still connected instead.
      if (room.state && !room.state.gameOver) {
        room.state.gameOver = true;
        room.state.winner = otherIndex;
        room.state.winReason = "disconnect";
        room.broadcastState();
        room.awardResults().catch(() => {});
        room.finishTurnWait?.(); // unstick runTurnLoop's pending waitForTurnActions, if any
      }
      // Room is left in place (not deleted) so the same code can be used to reconnect;
      // a stale/abandoned room is harmless since it's only kept in memory, not the DB.
    });
  });
}
