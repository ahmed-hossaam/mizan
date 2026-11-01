import { Router } from "express";
import { getAuth } from "@clerk/express";
import { GetCurrentUserResponse } from "@workspace/api-zod";

const router = Router();

router.get("/auth/me", (req: any, res: any): void => {
  const auth = getAuth(req);
  const claims = auth.sessionClaims as Record<string, unknown> | null;

  const data = GetCurrentUserResponse.parse({
    id: auth.userId,
    email: typeof claims?.email === "string" ? claims.email : null,
    name: typeof claims?.name === "string" ? claims.name : null,
  });

  res.json(data);
});

export default router;