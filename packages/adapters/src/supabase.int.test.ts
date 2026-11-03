// Integration: core use cases + Supabase adapters against the real project, as real users.
// Creates throwaway auth users and removes everything it created.
// Run: pnpm --filter @art-flux/adapters test:int
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InviteInvalidError,
  NotFoundError,
  acceptInvite,
  attachOriginSession,
  createGroup,
  createInvite,
  createProject,
  createProjectWithOrigin,
  createSession,
  getProject,
  getSession,
  listInvites,
  listProjects,
  listSessions,
  listTeam,
  listMembers,
  randomTokenGenerator,
  removeFromTeam,
  resolveInitialGroup,
  revokeInvite,
  setTeamRoles,
  updateProject,
  updateSession,
} from "@art-flux/core";
import { SupabaseGroupsRepo } from "./groups";
import { SupabaseInvitesRepo } from "./invites";
import { SupabaseProjectsRepo } from "./projects";
import { SupabaseSessionsRepo } from "./sessions";

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
    sessions: new SupabaseSessionsRepo(db),
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
    // projects.origin_session_id and sessions.project_id point at each other: break the cycle first.
    await admin.from("projects").update({ origin_session_id: null }).eq("group_id", id);
    await admin.from("sessions").delete().eq("group_id", id);
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

describe("sessions on Supabase (HU-07)", () => {
  async function groupWithAna() {
    const g = await newGroup(`Sesiones ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    return g;
  }
  const make = (actor: typeof owner, groupId: string, extra: object = {}) =>
    createSession(actor.deps, { id: randomUUID(), groupId, userId: actor.id, ...extra });

  it("any member plans sessions; numbers are per scope; a past date is fine", async () => {
    const g = await groupWithAna();
    const project = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Cristina" });

    const a = await make(ana, g.id, { date: "2020-01-05", place: "Casa", objective: "Reencuentro" });
    const b = await make(owner, g.id);
    const c = await make(ana, g.id, { projectId: project.id });
    expect([a.number, b.number, c.number]).toEqual([1, 2, 1]);
    expect(a).toMatchObject({ date: "2020-01-05", place: "Casa", status: "planned", createdBy: ana.id });

    expect((await listSessions(ana.deps, { groupId: g.id, userId: ana.id, projectId: null })).length).toBe(2);
    expect((await getSession(ana.deps, { groupId: g.id, userId: ana.id, number: 1, projectSlug: "cristina" })).id).toBe(c.id);

    // Outsiders neither see nor create sessions.
    await expect(listSessions(intruder.deps, { groupId: g.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(make(intruder, g.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("two people planning at the same time get different numbers (real unique index + retry)", async () => {
    const g = await groupWithAna();
    const results = await Promise.all([make(owner, g.id), make(ana, g.id), make(owner, g.id), make(ana, g.id)]);
    expect(results.map((s) => s.number).sort()).toEqual([1, 2, 3, 4]);
  });

  it("the creator and the admin edit; other members cannot; the database protects number and project", async () => {
    const g = await groupWithAna();
    const s = await make(ana, g.id, { place: "Casa" });
    await updateSession(ana.deps, { sessionId: s.id, userId: ana.id, changes: { place: "Teatro", date: "2026-12-01" } });
    const byAdmin = await updateSession(owner.deps, { sessionId: s.id, userId: owner.id, changes: { objective: "Nuevo" } });
    expect(byAdmin).toMatchObject({ place: "Teatro", date: "2026-12-01", objective: "Nuevo", number: 1 });

    await expect(
      updateSession(luis.deps, { sessionId: s.id, userId: luis.id, changes: { place: "x" } }),
    ).rejects.toBeInstanceOf(NotFoundError); // not even in the group

    // Bypassing the core: changing the number or moving the session is refused by column privileges.
    const renumber = await db.ana!.from("sessions").update({ number: 99 }).eq("id", s.id);
    expect(renumber.error).not.toBeNull();
    const other = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Otra" });
    const move = await db.ana!.from("sessions").update({ project_id: other.id }).eq("id", s.id);
    expect(move.error).not.toBeNull();
    // ...and a session cannot be inserted with a project of another group.
    const foreign = await newGroup(`Ajeno ${run}`);
    const foreignProject = await createProject(owner.deps, { id: randomUUID(), groupId: foreign.id, userId: owner.id, title: "Ajena" });
    const crossed = await db.owner!.from("sessions").insert({
      id: randomUUID(), group_id: g.id, project_id: foreignProject.id, number: 50, created_by: owner.id,
    });
    expect(crossed.error).not.toBeNull();
  });

  it("HU-05: a group session becomes the origin of a project and renumbers to S01", async () => {
    const g = await groupWithAna();
    const s1 = await make(ana, g.id, { objective: "Reencuentro" });
    const s2 = await make(ana, g.id);

    const { project } = await createProjectWithOrigin(owner.deps, {
      id: randomUUID(), groupId: g.id, userId: owner.id, title: "Cristina", originSessionId: s1.id,
    });
    expect(project.originSessionId).toBe(s1.id);
    const moved = await getSession(ana.deps, { groupId: g.id, userId: ana.id, number: 1, projectSlug: "cristina" });
    expect(moved).toMatchObject({ id: s1.id, projectId: project.id, number: 1 });
    expect((await getProject(ana.deps, { groupId: g.id, slug: "cristina", userId: ana.id })).originSessionId).toBe(s1.id);

    // The other group session keeps its place and the next project session continues after S01.
    expect((await getSession(ana.deps, { groupId: g.id, userId: ana.id, number: 2 })).id).toBe(s2.id);
    expect((await make(ana, g.id, { projectId: project.id })).number).toBe(2);

    // Rules: one origin per project, one project per session, admins only.
    await expect(
      attachOriginSession(owner.deps, { projectId: project.id, sessionId: s2.id, userId: owner.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    const second = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Segunda" });
    await expect(
      attachOriginSession(owner.deps, { projectId: second.id, sessionId: s1.id, userId: owner.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      attachOriginSession(ana.deps, { projectId: second.id, sessionId: s2.id, userId: ana.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // The database re-checks even if the core is bypassed.
    const direct = await db.ana!.rpc("attach_origin_session", { p_project: second.id, p_session: s2.id, p_number: 1 });
    expect(direct.error).not.toBeNull();
  });
});
