import { getAuth } from "@clerk/express";
import type { RequestHandler, Response } from "express";

type AuthResponse = Response & {
  locals: {
    userId?: string;
  };
};

export const requireAuth: RequestHandler = (
  req: any,
  res: any,
  next: any
) => {
  const userId = getAuth(req).userId;

  if (!userId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  res.locals.userId = userId;
  next();
};

export function getRequestUserId(res: AuthResponse): string {
  return res.locals.userId as string;
}