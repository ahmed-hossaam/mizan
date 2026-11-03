import { createClient, type User } from "@supabase/supabase-js";
import type { RequestHandler, Response } from "express";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseAuth = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null;

type AuthResponse = Response & {
  locals: {
    userId?: string;
    authUser?: User;
  };
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];

  if (!token) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  if (!supabaseAuth) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Sign in is required." });
      return;
    }

    const authResponse = res as AuthResponse;
    authResponse.locals.userId = data.user.id;
    authResponse.locals.authUser = data.user;
    next();
  } catch (error) {
    next(error);
  }
};

export function getRequestUserId(res: AuthResponse): string {
  return res.locals.userId as string;
}
