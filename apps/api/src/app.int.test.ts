// Integration: the HTTP API against the real Supabase project, using real user sessions.
// Creates throwaway auth users and removes everything it created.
// Run: pnpm --filter @art-flux/api test:int
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { supabaseWiring } from "@art-flux/adapters";
import { InMemoryFileStore } from "@art-flux/core";

process.loadEnvFile("../../.env");
const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const app = createApp(supabaseWiring({ SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey }, new InMemoryFileStore()));
const run = randomUUID().slice(0, 8);

interface Actor {
  id: string;
  token: string;
}

async function makeActor(label: string): Promise<Actor> {
  const email = `art-flux-test-${run}-${label}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token };
}

const call = (actor: Actor | string | null, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${typeof actor === "string" ? actor : actor.token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

let owner: Actor, ana: Actor, luis: Actor;
const groupIds: string[] = [];

beforeAll(async () => {
  [owner, ana, luis] = await Promise.all([makeActor("owner"), makeActor("ana"), makeActor("luis")]);
});

afterAll(async () => {
  for (const id of groupIds) {
    await admin.from("invites").delete().eq("group_id", id);
    await admin.from("members").delete().eq("group_id", id);
    await admin.from("groups").delete().eq("id", id);
  }
  // Profiles have no FK to the login account (by design), so they are removed explicitly.
  const actors = [owner, ana, luis].filter(Boolean);
  await admin.from("profiles").delete().in("id", actors.map((a) => a.id));
  for (const a of actors) await admin.auth.admin.deleteUser(a.id);
});

describe("API with real Supabase sessions", () => {
  it("rejects a missing or forged token with 401", async () => {
    expect((await call(null, "GET", "/me/start")).status).toBe(401);
    expect((await call("eyJhbGciOiJIUzI1NiJ9.e30.firma-falsa", "GET", "/me/start")).status).toBe(401);
    // The anon key is a valid JWT but not a user session.
    expect((await call(anonKey, "GET", "/me/start")).status).toBe(401);
  });

  it("new user -> create group -> invite -> join -> single use -> revoke", async () => {
    expect(await (await call(owner, "GET", "/me/start")).json()).toEqual({ destination: "none" });

    const created = await call(owner, "POST", "/groups", { name: `API ${run}`, city: "Medellín" });
    expect(created.status).toBe(201);
    const group = await created.json();
    groupIds.push(group.id);
    expect(group.handle).toMatch(/^api-/);
    expect(await (await call(owner, "GET", "/me/start")).json()).toMatchObject({
      destination: "group",
      group: { id: group.id },
    });

    const inviteRes = await call(owner, "POST", `/groups/${group.id}/invites`, { label: "para Ana" });
    expect(inviteRes.status).toBe(201);
    const invite = await inviteRes.json();

    // Ana joins with the link and then lands on the group.
    const joined = await call(ana, "POST", "/invites/accept", { token: invite.token });
    expect(joined.status).toBe(200);
    expect((await joined.json()).id).toBe(group.id);
    expect(await (await call(ana, "GET", "/me/start")).json()).toMatchObject({
      destination: "group",
      group: { id: group.id },
    });

    // The link is spent: Luis is refused and stays out.
    const refused = await call(luis, "POST", "/invites/accept", { token: invite.token });
    expect(refused.status).toBe(410);
    expect(await (await call(luis, "GET", "/me/start")).json()).toEqual({ destination: "none" });

    // Ana (member) cannot manage invitations; the owner sees who used the link.
    expect((await call(ana, "POST", `/groups/${group.id}/invites`, {})).status).toBe(403);
    const list = await (await call(owner, "GET", `/groups/${group.id}/invites`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: "para Ana", acceptedBy: ana.id });

    expect((await call(owner, "DELETE", `/invites/${invite.id}`)).status).toBe(204);
  });

  it("a non-member cannot list another group's invitations", async () => {
    const group = await (await call(owner, "POST", "/groups", { name: `Cerrado ${run}` })).json();
    groupIds.push(group.id);
    expect((await call(luis, "GET", `/groups/${group.id}/invites`)).status).toBe(403);
  });

  it("rejects an invalid group name with 400", async () => {
    const res = await call(owner, "POST", "/groups", { name: "" });
    expect(res.status).toBe(400);
  });
});
