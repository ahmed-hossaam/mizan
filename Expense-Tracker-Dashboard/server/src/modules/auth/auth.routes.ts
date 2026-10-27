import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../../config/prisma.js";
import {
  asyncHandler,
  clearSessionCookie,
  getUserId,
  requireAuth,
  setSessionCookie,
  signSession,
} from "../../middleware/auth.js";
import { HttpError, isUniqueViolation } from "../../utils/http.js";
import { DEFAULT_CATEGORIES } from "../../utils/categories.js";
import { credentialsSchema } from "./auth.schema.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many authentication attempts. Try again later." },
});

router.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true, createdAt: true },
        });
        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({
            userId: created.id,
            name: category.name,
            color: category.color,
          })),
        });
        return created;
      });
      setSessionCookie(res, signSession(user.id));
      res.status(201).json({ id: user.id, email: user.email });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "An account with that email already exists.");
      }
      throw error;
    }
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new HttpError(401, "Invalid email or password.");
    }
    setSessionCookie(res, signSession(user.id));
    res.json({ id: user.id, email: user.email });
  }),
);

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new HttpError(401, "Sign in is required.");
    }
    res.json(user);
  }),
);

export default router;
