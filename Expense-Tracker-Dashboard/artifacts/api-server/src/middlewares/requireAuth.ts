import { getAuth } from "@clerk/express";
import type { RequestHandler, Response } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }
  res.locals.userId = userId;
  next();
};

export function getRequestUserId(res: Response): string {
  return res.locals.userId as string;
}
