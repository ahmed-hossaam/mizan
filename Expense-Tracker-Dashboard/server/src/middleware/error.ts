import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  if (error instanceof Error && /must be|outside the supported|YYYY-MM/.test(error.message)) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }
  res.status(500).json({ error: "An unexpected server error occurred." });
};
