
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

import { env } from "../config/env";
import { redis } from "../config/redis";
import { socketAuth, type AuthSocket } from "./middleware/auth";
import { registerMessageHandlers } from "./handlers/message.handler";

export let io: Server;

export function initSocket(httpServer: HttpServer) {
  const pubClient = redis;
  const subClient = pubClient.duplicate();

  void subClient.connect();

  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    socketAuth(socket as AuthSocket, next);
  });

  io.on("connection", async (rawSocket) => {
    const socket = rawSocket as AuthSocket;
    const userId = socket.userId!;

    // Every authenticated device/tab joins the same user room.
    await socket.join(`user:${userId}`);

    await redis.sAdd(`presence:user:${userId}`, socket.id);
    await redis.set(`online:${userId}`, "1", { EX: 60 });

    socket.emit("presence:update", {
      userId,
      status: "online",
      lastSeen: null,
    });

    registerMessageHandlers(io, socket);

    socket.on("disconnect", async () => {
      await redis.sRem(`presence:user:${userId}`, socket.id);

      const remaining = await redis.sCard(`presence:user:${userId}`);

      if (remaining === 0) {
        await redis.del(`online:${userId}`);
        await redis.del(`presence:user:${userId}`);

        const lastSeen = new Date().toISOString();

        await redis.set(`lastSeen:${userId}`, lastSeen);

        socket.broadcast.emit("presence:update", {
          userId,
          status: "offline",
          lastSeen,
        });
      }
    });
  });

  return io;
}
