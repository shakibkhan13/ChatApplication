
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "pulsechat",
      audience: "pulsechat-api",
    });

    if (typeof payload === "string" || !payload.sub || !payload.email) {
      res.status(401).json({ message: "Invalid access token" });
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired access token" });
  }
}
