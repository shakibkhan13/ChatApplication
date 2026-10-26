
import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import { loginSchema, registerSchema } from "./auth.schema";

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
}

export const register = asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await authService.register(input);
  res.status(201).json({ user });
});

export const login = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const tokens = await authService.login(input.email, input.password);
  res.json(tokens);
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;

  if (typeof token !== "string" || !token) {
    res.status(400).json({ message: "refreshToken is required" });
    return;
  }

  const tokens = await authService.rotateRefreshToken(token);
  res.json(tokens);
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;

  if (typeof token === "string" && token) {
    await authService.logout(token);
  }

  res.status(200).json({ message: "Logged out successfully" });
});
