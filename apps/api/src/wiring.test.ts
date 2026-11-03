import { describe, expect, it } from "vitest";
import { wiringFromEnv } from "./wiring";

const supabase = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

describe("wiringFromEnv", () => {
  it("needs the Supabase address and the anon key", () => {
    expect(() => wiringFromEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => wiringFromEnv({ SUPABASE_URL: "https://x.supabase.co" })).toThrow(/SUPABASE_ANON_KEY/);
  });

  it("runs without R2, saying that files are not configured, and with it when all four variables are there", () => {
    expect(wiringFromEnv(supabase).filesConfigured).toBe(false);
    expect(wiringFromEnv({ ...supabase, R2_ACCOUNT_ID: "a", R2_BUCKET: "b" }).filesConfigured).toBe(false);
    const all = { ...supabase, R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" };
    expect(wiringFromEnv(all).filesConfigured).toBe(true);
  });

  it("never reads the service_role key or the database address", () => {
    const wiring = wiringFromEnv({ ...supabase, SUPABASE_SERVICE_ROLE_KEY: "secret", DATABASE_URL: "postgres://secret" });
    expect(JSON.stringify(Object.keys(wiring))).not.toMatch(/secret/);
  });
});
