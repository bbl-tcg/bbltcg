import * as db from "./db/index.js";

const tradeRooms = new Map(); // code -> TradeRoom

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (tradeRooms.has(code));
  return code;
}

class TradeRoom {
  constructor(code) {
    this.code = code;
    this.sockets = [null, null];
    this.userIds = [null, null];
    this.selections = [[], []]; // card ids each side is offering, from their OWN collection
    this.submitted = [false, false];
  }

  broadcast() {
    for (let i = 0; i < 2; i++) {
      const other = i === 0 ? 1 : 0;
      this.sockets[i]?.emit("trade-update", {
        yourSelection: this.selections[i],
        theirSelection: this.selections[other],
        yourSubmitted: this.submitted[i],
        theirSubmitted: this.submitted[other],
        bothPresent: !!(this.sockets[0] && this.sockets[1]),
      });
    }
  }

  async trySettle() {
    if (!this.submitted[0] || !this.submitted[1]) return;
    try {
      await db.executeTrade(this.userIds[0], this.selections[0], this.userIds[1], this.selections[1]);
      for (let i = 0; i < 2; i++) this.sockets[i]?.emit("trade-complete", { ok: true });
    } catch (err) {
      for (let i = 0; i < 2; i++) this.sockets[i]?.emit("trade-complete", { ok: false, reason: String(err.message || err) });
    } finally {
      tradeRooms.delete(this.code);
    }
  }
}

export function attachTrading(io) {
  const ns = io.of("/trade");

  ns.on("connection", (socket) => {
    socket.on("create-trade", ({ userId }, ack) => {
      if (!userId) return ack?.({ ok: false, reason: "You must be logged in to trade." });
      const code = generateInviteCode();
      const room = new TradeRoom(code);
      room.sockets[0] = socket;
      room.userIds[0] = userId;
      tradeRooms.set(code, room);
      socket.data.tradeCode = code;
      socket.data.tradeSide = 0;
      ack?.({ ok: true, code });
    });

    socket.on("join-trade", ({ code, userId }, ack) => {
      if (!userId) return ack?.({ ok: false, reason: "You must be logged in to trade." });
      const room = tradeRooms.get(code);
      if (!room) return ack?.({ ok: false, reason: "No trade with that invite code." });
      if (room.sockets[1]) return ack?.({ ok: false, reason: "That trade already has two players." });
      room.sockets[1] = socket;
      room.userIds[1] = userId;
      socket.data.tradeCode = code;
      socket.data.tradeSide = 1;
      ack?.({ ok: true, code });
      room.broadcast();
    });

    socket.on("update-selection", ({ cardIds }) => {
      const room = tradeRooms.get(socket.data.tradeCode);
      if (!room) return;
      const side = socket.data.tradeSide;
      room.selections[side] = Array.isArray(cardIds) ? cardIds : [];
      room.submitted = [false, false]; // changing a selection un-submits both sides
      room.broadcast();
    });

    socket.on("submit-trade", (_payload, ack) => {
      const room = tradeRooms.get(socket.data.tradeCode);
      if (!room) return ack?.({ ok: false });
      room.submitted[socket.data.tradeSide] = true;
      room.broadcast();
      room.trySettle();
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const room = tradeRooms.get(socket.data.tradeCode);
      if (!room) return;
      const other = socket.data.tradeSide === 0 ? 1 : 0;
      room.sockets[other]?.emit("opponent-disconnected");
    });
  });
}
