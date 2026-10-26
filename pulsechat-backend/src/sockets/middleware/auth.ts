
import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export interface AuthSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

export function socketAuth(
  socket: AuthSocket,
  next: (err?: Error) => void
) {
  const token = socket.handshake.auth?.token;

  if (typeof token !== "string" || !token) {
    return next(new Error("Authentication required"));
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "pulsechat",
      audience: "pulsechat-api",
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) {
      return next(new Error("Invalid access token"));
    }

    socket.userId = payload.sub;
    socket.userEmail = payload.email;

    next();
  } catch {
    next(new Error("Invalid or expired access token"));
  }
}
