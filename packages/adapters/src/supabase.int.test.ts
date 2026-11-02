// Integration: core use cases + Supabase adapters against the real project, as real users.
// Creates two throwaway auth users and removes everything it created. Run: pnpm --filter @art-flux/adapters test:int
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InviteEmailMismatchError,
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

function depsFor(db: SupabaseClient) {
  return {
    groups: new SupabaseGroupsRepo(db),
    invites: new SupabaseInvitesRepo(db),
    clock,
    tokens: randomTokenGenerator,
  };
}

async function makeActor(label: string): Promise<Actor> {
  const email = `art-flux-test-${run}-${label}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const db = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, deps: depsFor(db) };
}

let owner: Actor, ana: Actor, intruder: Actor;
const groupIds: string[] = [];

beforeAll(async () => {
  [owner, ana, intruder] = await Promise.all([makeActor("owner"), makeActor("ana"), makeActor("intruder")]);
});

afterAll(async () => {
  for (const id of groupIds) {
    await admin.from("invites").delete().eq("group_id", id);
    await admin.from("members").delete().eq("group_id", id);
    await admin.from("groups").delete().eq("id", id);
  }
  for (const a of [owner, ana, intruder]) if (a) await admin.auth.admin.deleteUser(a.id);
});

describe("groups on Supabase", () => {
  it("creates a group, makes the creator admin and gives each name a unique handle", async () => {
    const name = `Grupo de prueba ${run}`;
    const g1 = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name, city: "Medellín" });
    const g2 = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name });
    groupIds.push(g1.id, g2.id);

    expect(g2.handle).toBe(`${g1.handle}-2`);
    expect(await owner.deps.groups.getMemberRole(g1.id, owner.id)).toBe("admin");
    const dest = await resolveInitialGroup(owner.deps, owner.id);
    expect(dest.destination).toBe("choose");
  });

  it("hides groups from people who are not members (RLS)", async () => {
    const g = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name: `Privado ${run}` });
    groupIds.push(g.id);
    expect(await intruder.deps.groups.getById(g.id)).toBeNull();
    expect(await resolveInitialGroup(intruder.deps, intruder.id)).toEqual({ destination: "none" });
  });

  it("sees handles taken by groups it cannot read", async () => {
    const g = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name: `Visible ${run}` });
    groupIds.push(g.id);
    expect(await intruder.deps.groups.handleExists(g.handle)).toBe(true);
    const mine = await createGroup(intruder.deps, { id: randomUUID(), userId: intruder.id, name: `Visible ${run}` });
    groupIds.push(mine.id);
    expect(mine.handle).toBe(`${g.handle}-2`);
  });
});

describe("invitations on Supabase", () => {
  it("full flow: invite by email, wrong email refused, right email joins, revoke", async () => {
    const g = await createGroup(owner.deps, { id: randomUUID(), userId: owner.id, name: `Invitar ${run}` });
    groupIds.push(g.id);

    const inv = await createInvite(owner.deps, {
      id: randomUUID(),
      groupId: g.id,
      userId: owner.id,
      email: ana.email.toUpperCase(),
    });
    expect(inv.email).toBe(ana.email);
    expect(await listInvites(owner.deps, { groupId: g.id, userId: owner.id })).toHaveLength(1);

    // Someone else holding the token cannot use it.
    await expect(
      acceptInvite(intruder.deps, { token: inv.token, userId: intruder.id, userEmail: intruder.email }),
    ).rejects.toBeInstanceOf(InviteEmailMismatchError);
    expect(await owner.deps.groups.getMemberRole(g.id, intruder.id)).toBeNull();

    // Even if the caller lies about the email, the database checks the session's own email.
    await expect(
      acceptInvite(intruder.deps, { token: inv.token, userId: intruder.id, userEmail: ana.email }),
    ).rejects.toBeInstanceOf(InviteEmailMismatchError);
    expect(await owner.deps.groups.getMemberRole(g.id, intruder.id)).toBeNull();

    // The invited person joins, and can then see the group.
    const joined = await acceptInvite(ana.deps, { token: inv.token, userId: ana.id, userEmail: ana.email });
    expect(joined.id).toBe(g.id);
    expect(await owner.deps.groups.getMemberRole(g.id, ana.id)).toBe("member");
    await acceptInvite(ana.deps, { token: inv.token, userId: ana.id, userEmail: ana.email }); // idempotent

    // A member cannot manage invitations.
    await expect(
      createInvite(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, email: "x@example.com" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Revoking stops the link but keeps Ana in the group.
    await revokeInvite(owner.deps, { inviteId: inv.id, userId: owner.id });
    await expect(
      acceptInvite(ana.deps, { token: inv.token, userId: ana.id, userEmail: ana.email }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
    expect(await owner.deps.groups.getMemberRole(g.id, ana.id)).toBe("member");
    expect(await listInvites(owner.deps, { groupId: g.id, userId: owner.id })).toHaveLength(0);
  });

  it("an unknown token is invalid", async () => {
    await expect(
      acceptInvite(ana.deps, { token: "x".repeat(43), userId: ana.id, userEmail: ana.email }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
  });
});
