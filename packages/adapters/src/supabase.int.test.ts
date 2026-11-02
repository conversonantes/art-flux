// Integration: core use cases + Supabase adapters against the real project, as real users.
// Creates throwaway auth users and removes everything it created.
// Run: pnpm --filter @art-flux/adapters test:int
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InviteInvalidError,
  NotFoundError,
  acceptInvite,
  createGroup,
  createInvite,
  createProject,
  getProject,
  listInvites,
  listProjects,
  listTeam,
  listMembers,
  randomTokenGenerator,
  removeFromTeam,
  resolveInitialGroup,
  revokeInvite,
  setTeamRoles,
  updateProject,
} from "@art-flux/core";
import { SupabaseGroupsRepo } from "./groups";
import { SupabaseInvitesRepo } from "./invites";
import { SupabaseProjectsRepo } from "./projects";

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
    projects: new SupabaseProjectsRepo(db),
    clock: clk,
    tokens: randomTokenGenerator,
  };
}

const db: Record<string, SupabaseClient> = {};

async function makeActor(label: string): Promise<Actor> {
  const email = `art-flux-test-${run}-${label}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Prueba ${label}` },
  });
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
    const { data: owned } = await admin.from("projects").select("id").eq("group_id", id);
    const projectIds = (owned ?? []).map((p) => p.id);
    if (projectIds.length) await admin.from("project_team").delete().in("project_id", projectIds);
    await admin.from("projects").delete().eq("group_id", id);
    await admin.from("invites").delete().eq("group_id", id);
    await admin.from("members").delete().eq("group_id", id);
    await admin.from("groups").delete().eq("id", id);
  }
  // Profiles have no FK to the login account (by design), so they are removed explicitly.
  const actors = [owner, ana, luis, intruder].filter(Boolean);
  await admin.from("profiles").delete().in("id", actors.map((a) => a.id));
  for (const a of actors) await admin.auth.admin.deleteUser(a.id);
});

describe("profiles", () => {
  it("creates a profile for every new login account", async () => {
    const { data, error } = await admin.from("profiles").select("id").in("id", [owner.id, ana.id]);
    expect(error).toBeNull();
    expect(data?.map((p) => p.id).sort()).toEqual([owner.id, ana.id].sort());
  });
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

    // Co-members see each other's names (copied from Google by the profile trigger); outsiders do not.
    const members = await listMembers(ana.deps, { groupId: g.id, userId: ana.id });
    expect(members.map((m) => [m.role, m.displayName])).toEqual([
      ["admin", "Prueba owner"],
      ["member", "Prueba ana"],
    ]);
    const { data: seenByIntruder } = await db.intruder!.from("profiles").select("id").eq("id", ana.id);
    expect(seenByIntruder).toEqual([]);
    await expect(listMembers(intruder.deps, { groupId: g.id, userId: intruder.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

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

describe("projects and team on Supabase", () => {
  async function groupWithAna() {
    const g = await newGroup(`Obras ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    return g;
  }

  it("HU-05: admin creates and edits; members read; outsiders see nothing", async () => {
    const g = await groupWithAna();
    const p = await createProject(owner.deps, {
      id: randomUUID(), groupId: g.id, userId: owner.id,
      title: "Cristina", status: "staging", themes: ["#Memoria", "duelo"], visibilityAgreement: "Solo fotos",
    });
    expect(p).toMatchObject({ slug: "cristina", status: "staging", themes: ["memoria", "duelo"] });

    // Same title again in the same group gets a numeric slug.
    const again = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Cristina" });
    expect(again.slug).toBe("cristina-2");

    // The same title in another group keeps the plain slug.
    const other = await newGroup(`Otras obras ${run}`);
    const elsewhere = await createProject(owner.deps, { id: randomUUID(), groupId: other.id, userId: owner.id, title: "Cristina" });
    expect(elsewhere.slug).toBe("cristina");

    // Members read; they cannot create; outsiders do not even know the group exists.
    expect((await getProject(ana.deps, { groupId: g.id, slug: "cristina", userId: ana.id })).id).toBe(p.id);
    expect((await listProjects(ana.deps, { groupId: g.id, userId: ana.id })).map((x) => x.slug)).toEqual(["cristina-2", "cristina"]);
    await expect(
      createProject(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, title: "Mia" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listProjects(intruder.deps, { groupId: g.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);

    // Editing keeps the slug; an empty agreement clears it.
    const edited = await updateProject(owner.deps, {
      projectId: p.id, userId: owner.id,
      changes: { title: "Cristina (v2)", status: "running", visibilityAgreement: "" },
    });
    expect(edited).toMatchObject({ slug: "cristina", title: "Cristina (v2)", status: "running" });
    expect(edited.visibilityAgreement).toBeUndefined();
    await expect(
      updateProject(ana.deps, { projectId: p.id, userId: ana.id, changes: { title: "x" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("HU-06: roles per person, names from profiles, only group members, admin-only writes", async () => {
    const g = await groupWithAna();
    const p = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Equipo" });

    await setTeamRoles(owner.deps, { projectId: p.id, userId: owner.id, memberId: owner.id, roles: ["owner", "director"] });
    await setTeamRoles(owner.deps, { projectId: p.id, userId: owner.id, memberId: ana.id, roles: ["actor"] });
    await setTeamRoles(owner.deps, { projectId: p.id, userId: owner.id, memberId: ana.id, roles: ["actor", "technician"] }); // replaces

    const team = await listTeam(ana.deps, { projectId: p.id, userId: ana.id });
    expect(team.map((m) => [m.displayName, m.roles])).toEqual([
      ["Prueba owner", ["owner", "director"]],
      ["Prueba ana", ["actor", "technician"]],
    ]);

    // The core refuses people outside the group; the database refuses it too if the core is bypassed.
    await expect(
      setTeamRoles(owner.deps, { projectId: p.id, userId: owner.id, memberId: intruder.id, roles: ["actor"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const direct = await db.owner!.from("project_team").insert({ project_id: p.id, user_id: intruder.id, roles: [] });
    expect(direct.error).not.toBeNull();
    const byMember = await db.ana!.from("project_team").insert({ project_id: p.id, user_id: luis.id, roles: [] });
    expect(byMember.error).not.toBeNull();

    // Members and outsiders cannot edit; outsiders cannot read.
    await expect(
      setTeamRoles(ana.deps, { projectId: p.id, userId: ana.id, memberId: ana.id, roles: ["director"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listTeam(intruder.deps, { projectId: p.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);

    // Removing from the team keeps the person in the group.
    await removeFromTeam(owner.deps, { projectId: p.id, userId: owner.id, memberId: ana.id });
    expect((await listTeam(owner.deps, { projectId: p.id, userId: owner.id })).map((m) => m.userId)).toEqual([owner.id]);
    expect(await owner.deps.groups.getMemberRole(g.id, ana.id)).toBe("member");
  });
});
