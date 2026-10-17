function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  // Comma-separated list of browser origins allowed to call the API with cookies.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  production: process.env.NODE_ENV === "production",
  test: process.env.NODE_ENV === "test",
  appUrl: () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: () => required("SESSION_SECRET"),
  redisUrl: () => process.env.REDIS_URL || null,
  smsProvider: () => process.env.SMS_PROVIDER ?? "mock",
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN || null,
};
