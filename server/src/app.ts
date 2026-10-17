import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { eventAccess } from "./access.js";
import { loadAuth } from "./auth.js";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { checkinsRouter } from "./routes/checkins.js";
import { deskRouter } from "./routes/desk.js";
import { eventRouter, eventsRouter } from "./routes/events.js";
import { giftsRouter } from "./routes/gifts.js";
import { guestsRouter } from "./routes/guests.js";
import { invitationsRouter } from "./routes/invitations.js";
import { filesRouter, mediaRouter } from "./routes/media.js";
import { organizationsRouter } from "./routes/organizations.js";
import { ordersRouter, publicEventsRouter } from "./routes/public-tickets.js";
import { reportsRouter } from "./routes/reports.js";
import { seatingRouter } from "./routes/seating.js";
import { eventTelegramRouter, telegramWebhookRouter } from "./routes/telegram.js";
import { templatesRouter } from "./routes/templates.js";
import { thankYouRouter } from "./routes/thank-you.js";
import { ticketingRouter } from "./routes/ticketing.js";

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
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/invitations", invitationsRouter);
  app.use("/api/telegram", telegramWebhookRouter);
  app.use("/api/public/events", publicEventsRouter);
  app.use("/api/orders", ordersRouter);
  // Everything about one event: eventAccess checks the caller belongs to it first.
  const event = Router({ mergeParams: true });
  event.use(eventAccess);
  event.use(eventRouter, mediaRouter, guestsRouter, checkinsRouter, giftsRouter, reportsRouter, eventTelegramRouter, seatingRouter, thankYouRouter, ticketingRouter);
  app.use("/api/events/:eventId", event);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
