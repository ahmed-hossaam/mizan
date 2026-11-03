import { Router } from "express";
import type { User } from "@supabase/supabase-js";
import { GetCurrentUserResponse } from "@workspace/api-zod";

const router = Router();

router.get("/auth/me", (_req, res): void => {
  const user = res.locals.authUser as User | undefined;
  const metadata = user?.user_metadata;
  const name = typeof metadata?.full_name === "string"
    ? metadata.full_name
    : typeof metadata?.name === "string"
      ? metadata.name
      : null;

  const data = GetCurrentUserResponse.parse({
    id: user?.id,
    email: user?.email ?? null,
    name,
  });

  res.json(data);
});

export default router;
