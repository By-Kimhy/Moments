import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadAuth } from "./auth.js";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { deskRouter } from "./routes/desk.js";
import { eventRouter, eventsRouter } from "./routes/events.js";
import { templatesRouter } from "./routes/templates.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Behind one reverse proxy in production, so rate limits see the visitor's address.
  app.set("trust proxy", 1);
  // The web app shows API images from another origin in development.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(loadAuth);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/desk", deskRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/events/:eventId", eventRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
