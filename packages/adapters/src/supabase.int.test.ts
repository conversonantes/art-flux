// Integration: core use cases + Supabase adapters against the real project, as real users.
// Creates throwaway auth users and removes everything it created.
// Run: pnpm --filter @art-flux/adapters test:int
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InviteInvalidError,
  acceptInvite,
  createGroup,
  createInvite,
  listInvites,
  randomTokenGenerator,
  resolveInitialGroup,
  revokeInvite,
} from "@art-flux/core";
import { SupabaseGroupsRepo } from "./groups";
import { SupabaseInvitesRepo } from "./invites";

process.loadEnvFile("../../.env");
const url = process.env.SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const clock = { now: () => new Date() };
const run = randomUUID().slice(0, 8);

interface Actor {
  id: string;
  email: string;
  deps: ReturnType<typeof depsFor>;
}

function depsFor(db: SupabaseClient, clk = clock) {
  return {
    groups: new SupabaseGroupsRepo(db),
    invites: new SupabaseInvitesRepo(db),
    clock: clk,
    tokens: randomTokenGenerator,
  };
}

const db: Record<string, SupabaseClient> = {};

async function makeActor(label: string): Promise<Actor> {
  const email = `art-flux-test-${run}-${label}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  db[label] = client;
  return { id: data.user.id, email, deps: depsFor(client) };
}

let owner: Actor, ana: Actor, luis: Actor, intruder: Actor;
const groupIds: string[] = [];

async function newGroup(name: string) {
  const g = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name });
  groupIds.push(g.id);
  return g;
}

beforeAll(async () => {
  [owner, ana, luis, intruder] = await Promise.all([
    makeActor("owner"),
    makeActor("ana"),
    makeActor("luis"),
    makeActor("intruder"),
  ]);
});

afterAll(async () => {
  for (const id of groupIds) {
    await admin.from("invites").delete().eq("group_id", id);
    await admin.from("members").delete().eq("group_id", id);
    await admin.from("groups").delete().eq("id", id);
  }
  for (const a of [owner, ana, luis, intruder]) if (a) await admin.auth.admin.deleteUser(a.id);
});

describe("groups on Supabase", () => {
  it("creates a group, makes the creator admin and gives each name a unique handle", async () => {
    const name = `Grupo de prueba ${run}`;
    const g1 = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name, city: "Medellín" });
    const g2 = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name });
    groupIds.push(g1.id, g2.id);

    expect(g2.handle).toBe(`${g1.handle}-2`);
    expect(await owner.deps.groups.getMemberRole(g1.id, owner.id)).toBe("admin");
    expect((await resolveInitialGroup(owner.deps, owner.id)).destination).toBe("choose");
  });

  it("hides groups from people who are not members (RLS)", async () => {
    const g = await newGroup(`Privado ${run}`);
    expect(await intruder.deps.groups.getById(g.id)).toBeNull();
    expect(await resolveInitialGroup(intruder.deps, intruder.id)).toEqual({ destination: "none" });
  });

  it("sees handles taken by groups it cannot read", async () => {
    const g = await newGroup(`Visible ${run}`);
    expect(await intruder.deps.groups.handleExists(g.handle)).toBe(true);
    const mine = await createGroup(intruder.deps, { id: randomUUID(), userId: intruder.id, name: `Visible ${run}` });
    groupIds.push(mine.id);
    expect(mine.handle).toBe(`${g.handle}-2`);
  });
});

describe("single-use invitations on Supabase", () => {
  it("full flow: one link per person, spent on first use, reload is fine, revoke keeps members", async () => {
    const g = await newGroup(`Invitar ${run}`);
    const forAna = await createInvite(owner.deps, {
      id: randomUUID(), groupId: g.id, userId: owner.id, label: "para Ana",
    });
    const forLuis = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });

    // Ana opens her link: she joins and can now see the group.
    const joined = await acceptInvite(ana.deps, { token: forAna.token, userId: ana.id });
    expect(joined.id).toBe(g.id);
    expect(await ana.deps.groups.getMemberRole(g.id, ana.id)).toBe("member");

    // Reloading the page is fine for Ana; the link is dead for anyone else.
    await acceptInvite(ana.deps, { token: forAna.token, userId: ana.id });
    await expect(
      acceptInvite(intruder.deps, { token: forAna.token, userId: intruder.id }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
    expect(await owner.deps.groups.getMemberRole(g.id, intruder.id)).toBeNull();

    // The admin sees who used each link.
    const list = await listInvites(owner.deps, { groupId: g.id, userId: owner.id });
    const used = list.find((i) => i.id === forAna.id);
    expect(used).toMatchObject({ label: "para Ana", acceptedBy: ana.id });
    expect(list.find((i) => i.id === forLuis.id)?.acceptedBy).toBeUndefined();

    // A plain member cannot manage invitations or read them.
    await expect(
      createInvite(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await ana.deps.invites.listByGroup(g.id)).toEqual([]);

    // Revoking an unused link kills it; revoking a used one keeps its member.
    await revokeInvite(owner.deps, { inviteId: forLuis.id, userId: owner.id });
    await expect(
      acceptInvite(luis.deps, { token: forLuis.token, userId: luis.id }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
    await revokeInvite(owner.deps, { inviteId: forAna.id, userId: owner.id });
    expect(await owner.deps.groups.getMemberRole(g.id, ana.id)).toBe("member");
  });

  it("an admin opening their own link does not spend it", async () => {
    const g = await newGroup(`Admin prueba ${run}`);
    const inv = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(owner.deps, { token: inv.token, userId: owner.id });
    expect(await owner.deps.groups.getMemberRole(g.id, owner.id)).toBe("admin");
    await expect(acceptInvite(luis.deps, { token: inv.token, userId: luis.id })).resolves.toBeDefined();
  });

  it("two people opening the same link at once: only one gets in", async () => {
    const g = await newGroup(`Carrera ${run}`);
    const inv = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    const results = await Promise.allSettled([
      acceptInvite(ana.deps, { token: inv.token, userId: ana.id }),
      acceptInvite(luis.deps, { token: inv.token, userId: luis.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(InviteInvalidError),
    });
    const { count } = await admin
      .from("members").select("*", { count: "exact", head: true })
      .eq("group_id", g.id).eq("role", "member");
    expect(count).toBe(1);
  });

  it("an expired link (created 8 days ago) is invalid", async () => {
    const g = await newGroup(`Caducado ${run}`);
    const eightDaysAgo = { now: () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) };
    const old = await createInvite(
      { ...owner.deps, clock: eightDaysAgo },
      { id: randomUUID(), groupId: g.id, userId: owner.id },
    );
    await expect(acceptInvite(luis.deps, { token: old.token, userId: luis.id })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
    expect(await owner.deps.groups.getMemberRole(g.id, luis.id)).toBeNull();
  });

  it("an unknown token is invalid", async () => {
    await expect(
      acceptInvite(ana.deps, { token: "x".repeat(43), userId: ana.id }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
  });
});
