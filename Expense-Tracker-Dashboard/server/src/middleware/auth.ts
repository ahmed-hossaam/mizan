import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";

type TokenPayload = { sub: string };

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.COOKIE_SAMESITE === "none",
    sameSite: env.COOKIE_SAMESITE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.COOKIE_SAMESITE === "none",
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
  });
}

export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new HttpError(401, "Sign in is required.");
  }
  return req.userId;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    next(new HttpError(401, "Sign in is required."));
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (!payload.sub) {
      next(new HttpError(401, "Sign in is required."));
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, "Your session has expired. Please sign in again."));
  }
};

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
