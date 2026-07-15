import { initializeGame, drawOpeningHand, mulligan, keepHand, drawScoreCards, playOpeningCard, rollForFirstPick, setFirstPlayer } from "../shared/engine/setup.js";
import { startTurn, endTurn as endTurnPhase } from "../shared/engine/turn.js";
import * as engine from "../shared/engine/engine.js";
import { makeRng } from "../shared/engine/rng.js";
import { getCard } from "../shared/engine/cardDb.js";
import * as db from "./db/index.js";

const rooms = new Map(); // code -> Room

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function isPlayerish(cardId) {
  const t = getCard(cardId).type;
  return t === "Player" || t === "StarPlayer";
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
  }

  broadcastState() {
    for (let i = 0; i < 2; i++) {
      if (this.sockets[i]) this.sockets[i].emit("state-update", { state: redactStateFor(this.state, i), you: i });
    }
  }

  /** Sends a choice request to whichever player actually owns it and awaits their answer
   * over the socket; falls back to a safe default if that player has disconnected. */
  resolveChoice = (request) => {
    return new Promise((resolve) => {
      const forPlayer = request.forPlayer ?? request.__controllerIndex ?? 0;
      const sock = this.sockets[forPlayer];
      if (!sock) return resolve(null);
      sock.emit("choice-request", request, (answer) => resolve(answer));
    });
  };

  decideWindow = (controllerIndex, available, windowCtx) => {
    if (available.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const sock = this.sockets[controllerIndex];
      if (!sock) return resolve(null);
      const options = available.map((s) => ({ cardId: s.cardId, zone: s.zone, instanceId: s.instanceId, handIndex: s.handIndex, label: s.label }));
      sock.emit("window-request", { options, windowCtx }, (chosenOption) => {
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
      const hand = this.state.players[p].hand.map((id) => getCard(id).name);
      const wantsMulligan = await this.resolveChoice({ forPlayer: p, type: "CHOOSE_YES_NO", prompt: `Your hand: ${hand.join(", ")}. Mulligan?` });
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
      const candidates = this.state.players[p].hand.map((cardId, handIndex) => ({ cardId, handIndex })).filter((e) => isPlayerish(e.cardId));
      const handIndex =
        candidates.length === 1
          ? candidates[0].handIndex
          : (await this.resolveChoice({ forPlayer: p, type: "CHOOSE_HAND_CARD", prompt: "Choose your opening Player/Star Player", options: candidates })).handIndex;
      playOpeningCard(this.state, p, handIndex);
    }

    this.broadcastState();
    await this.runTurnLoop();
  }

  async runTurnLoop() {
    while (!this.state.gameOver) {
      startTurn(this.state);
      this.broadcastState();
      if (this.state.gameOver) break;
      await this.waitForTurnActions(this.state.activePlayerIndex);
      if (this.state.gameOver) break;
    }
    this.broadcastState();
    await this.awardResults();
  }

  /** Listens for this player's action events until they end their turn. */
  waitForTurnActions(activeIndex) {
    return new Promise((resolve) => {
      const sock = this.sockets[activeIndex];
      if (!sock) return resolve();
      const handler = async (action, ack) => {
        try {
          const result = await this.applyAction(activeIndex, action);
          ack?.(result);
          this.broadcastState();
          if (action.type === "endTurn" || this.state.gameOver) {
            sock.off("game-action", handler);
            resolve();
          }
        } catch (err) {
          ack?.({ ok: false, reason: String(err.message || err) });
        }
      };
      sock.on("game-action", handler);
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
      default:
        return { ok: false, reason: "UNKNOWN_ACTION" };
    }
  }

  async awardResults() {
    if (this.state.winner === null || this.state.winner === undefined) return;
    for (let i = 0; i < 2; i++) {
      const userId = this.userIds[i];
      if (!userId) continue;
      await db.addPackPoints(userId, i === this.state.winner ? 4 : 2);
    }
  }
}

export function attachMultiplayer(io) {
  const mp = io.of("/multiplayer");

  mp.on("connection", (socket) => {
    socket.on("create-room", ({ deck, userId }, ack) => {
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
      room.sockets[1] = socket;
      room.userIds[1] = userId || null;
      room.decks[1] = deck;
      socket.data.roomCode = code;
      socket.data.playerIndex = 1;
      ack?.({ ok: true, code });
      room.runSetup().catch((err) => mp.to(code).emit("room-error", String(err.message || err)));
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room) return;
      const otherIndex = socket.data.playerIndex === 0 ? 1 : 0;
      room.sockets[otherIndex]?.emit("opponent-disconnected");
      // Room is left in place (not deleted) so the same code can be used to reconnect;
      // a stale/abandoned room is harmless since it's only kept in memory, not the DB.
    });
  });
}
