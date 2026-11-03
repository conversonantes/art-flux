import { createClient } from "@supabase/supabase-js";
import { randomTokenGenerator, type AppDeps, type AuthSession, type Authenticator } from "@art-flux/core";
import { SupabaseApproachesRepo } from "./approaches";
import { SupabaseFindingsRepo } from "./findings";
import { SupabaseGroupsRepo } from "./groups";
import { SupabaseInvitesRepo } from "./invites";
import { SupabaseProjectsRepo } from "./projects";
import { SupabaseSessionsRepo } from "./sessions";

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export interface Wiring {
  authenticator: Authenticator;
  /** Repositories acting as this session's user. */
  depsFor(session: AuthSession): AppDeps;
}

/**
 * Wires the core to Supabase. Only the *anon* key lives here: every request gets a client
 * carrying the user's own JWT (the session credential), so RLS applies even if a route has
 * a bug. The service_role key is deliberately never used on a request path.
 */
export function supabaseWiring(env: SupabaseEnv): Wiring {
  const base = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, base);
  const clock = { now: () => new Date() };

  return {
    authenticator: {
      async authenticate(credential) {
        // Asks Supabase Auth to validate it (signature, expiry, revoked sessions).
        const { data, error } = await anon.auth.getUser(credential);
        return error || !data.user ? null : { userId: data.user.id, credential };
      },
    },
    depsFor(session) {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        ...base,
        global: { headers: { Authorization: `Bearer ${session.credential}` } },
      });
      return {
        groups: new SupabaseGroupsRepo(db),
        invites: new SupabaseInvitesRepo(db),
        projects: new SupabaseProjectsRepo(db),
        sessions: new SupabaseSessionsRepo(db),
        approaches: new SupabaseApproachesRepo(db),
        findings: new SupabaseFindingsRepo(db),
        clock,
        tokens: randomTokenGenerator,
      };
    },
  };
}
