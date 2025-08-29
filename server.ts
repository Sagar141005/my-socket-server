import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import execRouter from "./routes/exec";

const app = express();

const PORT = process.env.PORT || 3001;
const allowedOrigins = JSON.parse(process.env.FRONTEND_ORIGIN || "[]");

app.use(
  cors({
    origin: allowedOrigins,
  })
);
app.use(express.json());

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  path: "/api/socket",
});
app.use("/api/exec", execRouter);

const roomUsers: Record<
  string,
  Map<
    string,
    { id: string; name: string; image?: string; sockets: Set<string> }
  >
> = {};

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", {
      userId: user.id,
      socketId: socket.id,
    });

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Map();
    }

    const existingUser = roomUsers[roomId].get(user.id);
    if (existingUser) {
      existingUser.sockets.add(socket.id);
    } else {
      roomUsers[roomId].set(user.id, {
        ...user,
        sockets: new Set([socket.id]),
      });
    }

    io.to(roomId).emit(
      "presence-update",
      Array.from(roomUsers[roomId].values())
    );
  });

  socket.on("leave-room", ({ roomId, userId }) => {
    socket.leave(roomId);

    const room = roomUsers[roomId];
    if (room && room.has(userId)) {
      const user = room.get(userId)!;
      user.sockets.delete(socket.id);
      if (user.sockets.size === 0) {
        room.delete(userId);
      }
      io.to(roomId).emit("presence-update", Array.from(room.values()));
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket ${socket.id} disconnected`);

    for (const roomId in roomUsers) {
      const room = roomUsers[roomId];
      let changed = false;

      for (const [userId, user] of room) {
        if (user.sockets.has(socket.id)) {
          user.sockets.delete(socket.id);
          if (user.sockets.size === 0) {
            room.delete(userId);
          }
          changed = true;
        }
      }

      if (changed) {
        io.to(roomId).emit("presence-update", Array.from(room.values()));
      }
    }
  });

  socket.on("code-change", ({ roomId, fileId, code }) => {
    socket.to(roomId).emit("code-update", { fileId, code });
  });

  socket.on("file-add", ({ roomId, file }) => {
    io.to(roomId).emit("file-added", file);
  });

  socket.on("file-delete", ({ roomId, fileId }) => {
    io.to(roomId).emit("file-deleted", fileId);
  });

  socket.on("file-rename", ({ roomId, fileId, newName }) => {
    io.to(roomId).emit("file-renamed", { fileId, newName });
  });

  socket.on(
    "terminal-output",
    ({ roomId, output, error, ranBy, timeStamp }) => {
      io.to(roomId).emit("terminal-update", {
        roomId,
        output,
        error,
        ranBy,
        timeStamp,
      });
    }
  );

  // Voice chat with roomId included
  socket.on("voice-offer", ({ roomId, offer, to }) => {
    socket.to(to).emit("voice-offer", { from: socket.id, offer, roomId });
  });

  socket.on("voice-answer", ({ roomId, answer, to }) => {
    socket.to(to).emit("voice-answer", { from: socket.id, answer, roomId });
  });

  socket.on("voice-candidate", ({ roomId, candidate, to }) => {
    socket
      .to(to)
      .emit("voice-candidate", { from: socket.id, candidate, roomId });
  });

  socket.on("mic-status", ({ roomId, userId, status }) => {
    io.to(roomId).emit("mic-status-update", { userId, status });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});
