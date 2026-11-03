// Composition root for local dev: `pnpm --filter @art-flux/api dev`.
// Production runs the same app as a Netlify Function (netlify/functions/api.ts). Which login and
// storage providers are used is decided in wiring.ts; the routes in app.ts know nothing about it.
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { wiringFromEnv } from "./wiring";

try {
  process.loadEnvFile("../../.env");
} catch {
  // Variables may already be in the environment (CI, hosting).
}

let configured;
try {
  configured = wiringFromEnv(process.env);
} catch (e) {
  console.error(`${e instanceof Error ? e.message : e} en el .env`);
  process.exit(1);
}
if (!configured.filesConfigured) {
  console.warn("Aviso: faltan las variables R2_* en el .env; el material con archivos no funcionará todavía.");
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp(configured.wiring);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
