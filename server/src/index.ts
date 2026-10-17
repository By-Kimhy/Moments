import { createApp } from "./app.js";
import { config } from "./config.js";

config.sessionSecret(); // fail fast if the secret is missing

createApp().listen(config.port, () => {
  console.log(`Moments API listening on http://localhost:${config.port}`);
});
