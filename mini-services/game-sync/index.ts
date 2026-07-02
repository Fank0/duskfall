// game-sync — a lightweight socket.io relay for the D&D VTT.
//
// It is intentionally stateless about the game: all game state lives in the
// Next.js app's SQLite DB. This service only maps socket connections to room
// codes and broadcasts "refresh" pings so every client in a room re-fetches
// state at the same time. This keeps a single source of truth (the DB) while
// giving near-instant multi-client sync.
//
// Runs on port 3003. The Caddy gateway forwards browser connections that
// carry `?XTransformPort=3003` to this port.

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;

const httpServer = createServer((req, res) => {
  // Tiny health-check endpoint.
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "game-sync", port: PORT }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("game-sync socket.io relay");
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// roomCode -> Set<socketId>  (for roster / presence)
const rooms = new Map();

function joinRoom(socket, roomCode, playerName) {
  const code = String(roomCode || "").toUpperCase();
  if (!code) return;
  socket.join(code);
  socket.data.roomCode = code;
  socket.data.playerName = playerName;
  if (!rooms.has(code)) rooms.set(code, new Map());
  rooms.get(code).set(socket.id, playerName);
  // Tell everyone in the room to refresh (roster may have changed).
  io.to(code).emit("room:refresh", { reason: "join" });
  io.to(code).emit("room:roster", {
    roomCode: code,
    members: Array.from(rooms.get(code).values()),
  });
  console.log(`[game-sync] ${playerName} joined room ${code} (${rooms.get(code).size} members)`);
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  const name = socket.data.playerName;
  if (code && rooms.has(code)) {
    rooms.get(code).delete(socket.id);
    if (rooms.get(code).size === 0) {
      rooms.delete(code);
    } else {
      io.to(code).emit("room:refresh", { reason: "leave" });
      io.to(code).emit("room:roster", {
        roomCode: code,
        members: Array.from(rooms.get(code).values()),
      });
    }
    console.log(`[game-sync] ${name} left room ${code}`);
  }
}

io.on("connection", (socket) => {
  console.log(`[game-sync] connected ${socket.id}`);

  socket.on("room:join", ({ roomCode, playerName }) => {
    leaveRoom(socket);
    joinRoom(socket, roomCode, playerName);
  });

  // A client did something (action, initiative, reset, image). Ping everyone.
  socket.on("room:ping", ({ roomCode } = {}) => {
    const code = (roomCode || socket.data.roomCode || "").toUpperCase();
    if (code) {
      io.to(code).emit("room:refresh", { reason: "ping", from: socket.id });
    }
  });

  // Explicit broadcast (host starts combat, etc.) — same as ping but tagged.
  socket.on("room:broadcast", ({ roomCode, event, payload } = {}) => {
    const code = (roomCode || socket.data.roomCode || "").toUpperCase();
    if (code) {
      io.to(code).emit(event ?? "room:refresh", payload ?? { reason: "broadcast" });
    }
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
    console.log(`[game-sync] disconnected ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[game-sync] socket.io relay listening on port ${PORT}`);
});
