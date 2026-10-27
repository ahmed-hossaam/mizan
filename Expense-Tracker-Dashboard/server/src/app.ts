import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";
import authRouter from "./modules/auth/auth.routes.js";
import categoriesRouter from "./modules/categories/categories.routes.js";
import transactionsRouter from "./modules/transactions/transactions.routes.js";
import budgetsRouter from "./modules/budgets/budgets.routes.js";
import statsRouter from "./modules/stats/stats.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/transactions", requireAuth, transactionsRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/budgets", requireAuth, budgetsRouter);
  app.use("/api/stats", requireAuth, statsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  app.use(errorHandler);
  return app;
}

export const app = createApp();
