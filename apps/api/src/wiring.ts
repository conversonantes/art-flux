// Composition for the real thing: Supabase for data and login, R2 for files, chosen from the
// environment. Used by the local dev server and by the Netlify Function, so both are wired alike.
import { MissingFileStore, R2FileStore, supabaseWiring, type Wiring } from "@art-flux/adapters";

type Env = Record<string, string | undefined>;

export interface EnvWiring {
  wiring: Wiring;
  /** False while the R2_* variables are missing: everything works but files. */
  filesConfigured: boolean;
}

/**
 * Only the *anon* key is read here, never `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`: those
 * belong to `scripts/` and must not exist where the API runs.
 */
export function wiringFromEnv(env: Env): EnvWiring {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY");
  }

  const filesConfigured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
  const files = filesConfigured
    ? new R2FileStore({
        accountId: R2_ACCOUNT_ID!,
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
        bucket: R2_BUCKET!,
      })
    : new MissingFileStore();

  return { wiring: supabaseWiring({ SUPABASE_URL, SUPABASE_ANON_KEY }, files), filesConfigured };
}
