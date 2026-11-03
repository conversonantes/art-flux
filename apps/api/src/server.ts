// Composition root for local dev: `pnpm --filter @art-flux/api dev`.
// Production runs the same app as a Netlify Function. This is where an identity/storage
// provider is chosen; the routes in app.ts know nothing about which one.
import { serve } from "@hono/node-server";
import { MissingFileStore, R2FileStore, supabaseWiring } from "@art-flux/adapters";
import { createApp } from "./app";

try {
  process.loadEnvFile("../../.env");
} catch {
  // Variables may already be in the environment (CI, hosting).
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env");
  process.exit(1);
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
const r2Ready = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET;
if (!r2Ready) console.warn("Aviso: faltan las variables R2_* en el .env; el material con archivos no funcionará todavía.");
const files = r2Ready
  ? new R2FileStore({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    })
  : new MissingFileStore();

const port = Number(process.env.PORT ?? 8787);
const app = createApp(supabaseWiring({ SUPABASE_URL, SUPABASE_ANON_KEY }, files));
serve({ fetch: app.fetch, port }, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
