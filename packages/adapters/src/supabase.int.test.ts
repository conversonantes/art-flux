// Integration: core use cases + Supabase adapters against the real project, as real users.
// Creates throwaway auth users and removes everything it created.
// Run: pnpm --filter @art-flux/adapters test:int
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConflictError,
  InMemoryFileStore,
  ForbiddenError,
  InviteInvalidError,
  NotFoundError,
  acceptInvite,
  addApproach,
  attachOriginSession,
  createGroup,
  createInvite,
  createProject,
  createProjectWithOrigin,
  createSession,
  getProject,
  getMyHome,
  confirmUpload,
  getMediaUrl,
  listMedia,
  registerMedia,
  removeMedia,
  listFragments,
  removeFragment,
  saveFragment,
  setApproachNote,
  listAttendees,
  markCompleted,
  updateAttendees,
  getSession,
  handleBase,
  handleCandidate,
  listApproaches,
  listInvites,
  listProjects,
  listSessions,
  listTeam,
  listMembers,
  randomTokenGenerator,
  removeApproach,
  removeFromTeam,
  reorderApproaches,
  resolveInitialGroup,
  revokeInvite,
  setTeamRoles,
  updateApproach,
  updateProject,
  updateSession,
} from "@art-flux/core";
import { SupabaseGroupsRepo } from "./groups";
import { SupabaseApproachesRepo } from "./approaches";
import { SupabaseFindingsRepo } from "./findings";
import { R2FileStore } from "./r2";
import { SupabaseMediaRepo } from "./media";
import { SupabaseInvitesRepo } from "./invites";
import { SupabaseProjectsRepo } from "./projects";
import { SupabaseSessionsRepo } from "./sessions";

process.loadEnvFile("../../.env");
const url = process.env.SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const clock = { now: () => new Date() };
const files = new InMemoryFileStore(); // stands for R2 in the Supabase tests; the real R2 has its own test
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
    approaches: new SupabaseApproachesRepo(db),
    findings: new SupabaseFindingsRepo(db),
    media: new SupabaseMediaRepo(db),
    files,
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

/**
 * A group for a test. It goes straight to the repository: the suite needs many groups from the same
 * person, and the core's ceiling (3 per person) has its own test below.
 */
async function newGroup(name: string) {
  // The same handles the core would give: the name, then name-2, name-3…
  let handle = handleBase(name);
  for (let n = 2; await owner.deps.groups.handleExists(handle); n++) handle = handleCandidate(handleBase(name), n);
  const g = { id: randomUUID(), handle, name, createdAt: new Date() };
  await owner.deps.groups.create(g, { groupId: g.id, userId: owner.id, role: "admin" });
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
    await admin.from("media").delete().eq("group_id", id); // it points at projects, sessions and approaches
    const { data: owned } = await admin.from("projects").select("id").eq("group_id", id);
    const projectIds = (owned ?? []).map((p) => p.id);
    // projects.origin_session_id and sessions.project_id point at each other: break the cycle first.
    await admin.from("projects").update({ origin_session_id: null }).eq("group_id", id);
    const { data: held } = await admin.from("sessions").select("id").eq("group_id", id);
    const sessionIds = (held ?? []).map((s) => s.id);
    if (sessionIds.length) {
      await admin.from("attendees").delete().in("session_id", sessionIds);
      const { data: mine } = await admin.from("approaches").select("id").in("session_id", sessionIds);
      const approachIds = (mine ?? []).map((a) => a.id);
      if (approachIds.length) await admin.from("finding_fragments").delete().in("approach_id", approachIds);
      await admin.from("approaches").delete().in("session_id", sessionIds);
    }
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

describe("group limit on Supabase", () => {
  it("counts only the groups someone created, and stops at the ceiling (3)", async () => {
    const made: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const g = await createGroup(luis.deps, { id: randomUUID(), userId: luis.id, name: `Tope ${n} ${run}` });
      made.push(g.id);
      groupIds.push(g.id);
    }
    expect(await luis.deps.groups.countAdminOf(luis.id)).toBe(3);
    await expect(
      createGroup(luis.deps, { id: randomUUID(), userId: luis.id, name: `Tope 4 ${run}` }),
    ).rejects.toBeInstanceOf(ConflictError);
    // Someone else is not affected, and belonging to groups does not count.
    expect(await ana.deps.groups.countAdminOf(ana.id)).toBe(0);
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

describe("home on Supabase (HU-09)", () => {
  it("gathers my approaches and upcoming sessions in one go; outsiders get nothing", async () => {
    const g = await newGroup(`Inicio ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const s1 = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, date: "2026-12-05" });
    const s2 = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, date: "2026-12-01" });
    await addApproach(ana.deps, { id: randomUUID(), sessionId: s1.id, userId: ana.id, text: "Mío" });
    await addApproach(ana.deps, { id: randomUUID(), sessionId: s1.id, userId: ana.id, text: "Del dueño", ownerId: owner.id });

    const home = await getMyHome(ana.deps, { groupId: g.id, userId: ana.id });
    expect(home.upcoming.map((u) => [u.session.id, u.approachCount])).toEqual([[s2.id, 0], [s1.id, 2]]);
    expect(home.mine.map((m) => m.approach.text)).toEqual(["Mío"]);

    await expect(getMyHome(intruder.deps, { groupId: g.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);
    // Bypassing the core: RLS shows an outsider no approaches.
    const direct = await db.intruder!.from("approaches").select("id").in("session_id", [s1.id, s2.id]);
    expect(direct.data ?? []).toEqual([]);
  });
});

describe("approaches on Supabase (HU-08)", () => {
  async function plannedSession() {
    const g = await newGroup(`Planteamientos ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const session = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, objective: "Analizar" });
    return { g, session };
  }
  const add = (actor: typeof owner, sessionId: string, text: string, ownerId?: string) =>
    addApproach(actor.deps, { id: randomUUID(), sessionId, userId: actor.id, text, ownerId });
  const order = async (actor: typeof owner, sessionId: string) =>
    (await listApproaches(actor.deps, { sessionId, userId: actor.id })).map((a) => a.text);

  it("members add, edit and remove; the owner must belong to the group", async () => {
    const { session } = await plannedSession();
    const a = await add(ana, session.id, "  Calentamiento corporal ");
    const b = await add(owner, session.id, "Improvisación", ana.id);
    expect(a).toMatchObject({ text: "Calentamiento corporal", position: 1, ownerId: ana.id });
    expect(b).toMatchObject({ position: 2, ownerId: ana.id });

    const edited = await updateApproach(owner.deps, { approachId: a.id, userId: owner.id, changes: { text: "Calentamiento", ownerId: owner.id } });
    expect(edited).toMatchObject({ text: "Calentamiento", ownerId: owner.id });

    await expect(add(ana, session.id, "Algo", intruder.id)).rejects.toBeInstanceOf(ForbiddenError);
    // The database says no as well, even if the core is bypassed.
    const direct = await db.ana!.from("approaches").insert({
      id: randomUUID(), session_id: session.id, position: 9, text: "x", owner_id: intruder.id, created_by: ana.id,
    });
    expect(direct.error).not.toBeNull();

    await removeApproach(ana.deps, { approachId: b.id, userId: ana.id });
    expect(await order(owner, session.id)).toEqual(["Calentamiento"]);
    expect((await add(ana, session.id, "Siguiente")).position).toBe(2); // continues after the highest, not the count
  });

  it("reorders atomically; stale lists are refused; position cannot be edited directly", async () => {
    const { session } = await plannedSession();
    const a = await add(ana, session.id, "Calentamiento");
    const b = await add(ana, session.id, "Improvisación");
    const c = await add(ana, session.id, "Análisis");

    const list = await reorderApproaches(owner.deps, { sessionId: session.id, userId: owner.id, orderedIds: [c.id, a.id, b.id] });
    expect(list.map((x) => [x.text, x.position])).toEqual([["Análisis", 1], ["Calentamiento", 2], ["Improvisación", 3]]);

    await expect(
      reorderApproaches(ana.deps, { sessionId: session.id, userId: ana.id, orderedIds: [a.id] }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Bypassing the core: the database function and column privileges refuse too.
    const partial = await db.ana!.rpc("reorder_approaches", { p_session: session.id, p_ids: [a.id] });
    expect(partial.error).not.toBeNull();
    const moved = await db.ana!.from("approaches").update({ position: 99 }).eq("id", a.id);
    expect(moved.error).not.toBeNull();
    expect(await order(owner, session.id)).toEqual(["Análisis", "Calentamiento", "Improvisación"]);
  });

  it("two people reordering at once end with one consistent order", async () => {
    const { session } = await plannedSession();
    const items = [await add(ana, session.id, "A"), await add(ana, session.id, "B"), await add(ana, session.id, "C")];
    const [a, b, c] = items.map((x) => x.id) as [string, string, string];
    await Promise.all([
      reorderApproaches(owner.deps, { sessionId: session.id, userId: owner.id, orderedIds: [c, b, a] }),
      reorderApproaches(ana.deps, { sessionId: session.id, userId: ana.id, orderedIds: [b, a, c] }),
    ]);
    const final = await listApproaches(owner.deps, { sessionId: session.id, userId: owner.id });
    expect(final.map((x) => x.position)).toEqual([1, 2, 3]); // no duplicates or gaps
    expect(["C,B,A", "B,A,C"]).toContain(final.map((x) => x.text).join(","));
  });

  it("outsiders see and change nothing", async () => {
    const { session } = await plannedSession();
    const a = await add(ana, session.id, "Privado");
    await expect(listApproaches(intruder.deps, { sessionId: session.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(add(intruder, session.id, "Intruso")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      reorderApproaches(intruder.deps, { sessionId: session.id, userId: intruder.id, orderedIds: [a.id] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const direct = await db.intruder!.from("approaches").insert({
      id: randomUUID(), session_id: session.id, position: 5, text: "x", owner_id: intruder.id, created_by: intruder.id,
    });
    expect(direct.error).not.toBeNull();
  });

  it("once the session was held, planning is frozen (core and database)", async () => {
    const { session } = await plannedSession();
    const a = await add(ana, session.id, "Antes");
    await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [ana.id] });

    await expect(add(ana, session.id, "Tarde")).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateApproach(ana.deps, { approachId: a.id, userId: ana.id, changes: { text: "Cambio" } }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      reorderApproaches(ana.deps, { sessionId: session.id, userId: ana.id, orderedIds: [a.id] }),
    ).rejects.toBeInstanceOf(ConflictError);

    const direct = await db.ana!.from("approaches").insert({
      id: randomUUID(), session_id: session.id, position: 2, text: "Tarde", owner_id: ana.id, created_by: ana.id,
    });
    expect(direct.error).not.toBeNull();
    expect(await order(ana, session.id)).toEqual(["Antes"]); // still readable
  });
});

describe("held sessions on Supabase (HU-11)", () => {
  async function plannedSession() {
    const g = await newGroup(`Realizada ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const session = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id });
    return { g, session };
  }

  it("any member marks it held with attendees; they can be corrected afterwards", async () => {
    const { session } = await plannedSession();
    const done = await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [ana.id, owner.id] });
    expect(done.status).toBe("completed");
    expect((await listAttendees(owner.deps, { sessionId: session.id, userId: owner.id })).sort()).toEqual([ana.id, owner.id].sort());

    await updateAttendees(owner.deps, { sessionId: session.id, userId: owner.id, attendeeIds: [owner.id] });
    expect(await listAttendees(ana.deps, { sessionId: session.id, userId: ana.id })).toEqual([owner.id]);
    await expect(
      markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("an attendee from outside the group is refused and nothing is half-saved (core and database)", async () => {
    const { session } = await plannedSession();
    await expect(
      markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [intruder.id] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const direct = await db.ana!.rpc("complete_session", { p_session: session.id, p_attendees: [intruder.id] });
    expect(direct.error).not.toBeNull();
    expect((await getSession(ana.deps, { groupId: session.groupId, userId: ana.id, number: session.number })).status).toBe("planned");
    expect(await listAttendees(ana.deps, { sessionId: session.id, userId: ana.id })).toEqual([]);
  });

  it("the database refuses what bypasses the core: direct status, direct attendees, outsiders", async () => {
    const { session } = await plannedSession();
    const status = await db.ana!.from("sessions").update({ status: "completed" }).eq("id", session.id);
    expect(status.error).not.toBeNull();
    const insert = await db.ana!.from("attendees").insert({ session_id: session.id, user_id: ana.id });
    expect(insert.error).not.toBeNull();

    await expect(
      markCompleted(intruder.deps, { sessionId: session.id, userId: intruder.id, attendeeIds: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const outsider = await db.intruder!.rpc("complete_session", { p_session: session.id, p_attendees: [] });
    expect(outsider.error).not.toBeNull();
    const early = await db.ana!.rpc("set_attendees", { p_session: session.id, p_attendees: [ana.id] }); // not held yet
    expect(early.error).not.toBeNull();

    await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [ana.id] });
    const seen = await db.intruder!.from("attendees").select("user_id").eq("session_id", session.id);
    expect(seen.data ?? []).toEqual([]);
  });
});

describe("approach note on Supabase", () => {
  async function approachOf(ownerActor: typeof owner) {
    const g = await newGroup(`Nota ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const session = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id });
    const approach = await addApproach(ana.deps, {
      id: randomUUID(), sessionId: session.id, userId: ana.id, text: "Calentamiento", ownerId: ownerActor.id,
    });
    return { session, approach };
  }

  it("the owner writes it, the group reads it, and the database refuses everyone else", async () => {
    const { session, approach } = await approachOf(ana);
    const saved = await setApproachNote(ana.deps, { approachId: approach.id, userId: ana.id, note: "  Saludo al sol " });
    expect(saved.note).toBe("Saludo al sol");
    const seen = await listApproaches(owner.deps, { sessionId: session.id, userId: owner.id });
    expect(seen[0]?.note).toBe("Saludo al sol");

    await expect(
      setApproachNote(owner.deps, { approachId: approach.id, userId: ana.id, note: "x" }), // the admin's client, someone else's note
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Bypassing the core: neither the function nor a plain UPDATE lets a non-owner write it.
    const viaFunction = await db.owner!.rpc("set_approach_note", { p_approach: approach.id, p_note: "ajeno" });
    expect(viaFunction.error).not.toBeNull();
    const direct = await db.ana!.from("approaches").update({ note: "directo" }).eq("id", approach.id);
    expect(direct.error).not.toBeNull();
    const outsider = await db.intruder!.from("approaches").select("note").eq("id", approach.id);
    expect(outsider.data ?? []).toEqual([]);

    expect((await listApproaches(ana.deps, { sessionId: session.id, userId: ana.id }))[0]?.note).toBe("Saludo al sol");
    const cleared = await setApproachNote(ana.deps, { approachId: approach.id, userId: ana.id, note: null });
    expect(cleared.note).toBeUndefined();
  });

  it("is frozen once the session was held", async () => {
    const { session, approach } = await approachOf(ana);
    await setApproachNote(ana.deps, { approachId: approach.id, userId: ana.id, note: "Antes" });
    await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [] });
    await expect(
      setApproachNote(ana.deps, { approachId: approach.id, userId: ana.id, note: "Tarde" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const viaFunction = await db.ana!.rpc("set_approach_note", { p_approach: approach.id, p_note: "Tarde" });
    expect(viaFunction.error).not.toBeNull();
  });
});

describe("findings on Supabase (HU-12)", () => {
  async function heldApproach() {
    const g = await newGroup(`Hallazgos ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const session = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id });
    const approach = await addApproach(ana.deps, { id: randomUUID(), sessionId: session.id, userId: ana.id, text: "Análisis" });
    return { g, session, approach };
  }
  const save = (actor: typeof owner, approachId: string, text: string, id = randomUUID(), kind = "found") =>
    saveFragment(actor.deps, { id, approachId, userId: actor.id, kind, text });

  it("members write fragments after the session was held; each is edited only by its author; saving twice is harmless", async () => {
    const { session, approach, g } = await heldApproach();
    await expect(save(ana, approach.id, "Antes de tiempo")).rejects.toBeInstanceOf(ConflictError);
    await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [ana.id] });

    const id = randomUUID();
    await save(ana, approach.id, "Acciones claras", id);
    await save(ana, approach.id, "Acciones claras y separadas", id); // autosave: same id
    await save(owner, approach.id, "Faltó el étude", randomUUID(), "missing");
    const list = await listFragments(owner.deps, { approachId: approach.id, userId: owner.id });
    expect(list.map((f) => [f.authorId, f.kind, f.text])).toEqual([
      [ana.id, "found", "Acciones claras y separadas"],
      [owner.id, "missing", "Faltó el étude"],
    ]);

    await expect(save(owner, approach.id, "Pisado", id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeFragment(owner.deps, { fragmentId: id, userId: owner.id })).rejects.toBeInstanceOf(ForbiddenError);

    // The home counts it: the only approach has a finding, so nothing is left to record.
    const home = await getMyHome(ana.deps, { groupId: g.id, userId: ana.id });
    expect(home.toRecord).toEqual([]);
    await removeFragment(ana.deps, { fragmentId: id, userId: ana.id });
    expect((await listFragments(ana.deps, { approachId: approach.id, userId: ana.id })).map((f) => f.authorId)).toEqual([owner.id]);
  });

  it("the database refuses what bypasses the core: other authors, planned sessions, direct edits and deletes, outsiders", async () => {
    const { session, approach } = await heldApproach();
    const row = (author: string, id = randomUUID()) => ({
      id, approach_id: approach.id, author_id: author, kind: "found", text: "x",
    });

    const early = await db.ana!.from("finding_fragments").insert(row(ana.id)); // session still planned
    expect(early.error).not.toBeNull();

    await markCompleted(ana.deps, { sessionId: session.id, userId: ana.id, attendeeIds: [] });
    const asOther = await db.ana!.from("finding_fragments").insert(row(owner.id)); // pretending to be someone else
    expect(asOther.error).not.toBeNull();
    const fromOutside = await db.intruder!.from("finding_fragments").insert(row(intruder.id));
    expect(fromOutside.error).not.toBeNull();

    const mine = row(ana.id);
    expect((await db.ana!.from("finding_fragments").insert(mine)).error).toBeNull();
    const edited = await db.owner!.from("finding_fragments").update({ text: "ajeno" }).eq("id", mine.id).select();
    expect(edited.data ?? []).toEqual([]); // RLS: not their row, nothing changes
    const moved = await db.ana!.from("finding_fragments").update({ kind: "missing" }).eq("id", mine.id);
    expect(moved.error).not.toBeNull(); // only the text is writable
    const softDeleted = await db.ana!.from("finding_fragments").update({ deleted_at: new Date().toISOString() }).eq("id", mine.id);
    expect(softDeleted.error).not.toBeNull();
    const removeOther = await db.owner!.rpc("remove_finding_fragment", { p_fragment: mine.id });
    expect(removeOther.error).not.toBeNull();

    const seenByOutsider = await db.intruder!.from("finding_fragments").select("id").eq("approach_id", approach.id);
    expect(seenByOutsider.data ?? []).toEqual([]);
    await expect(listFragments(intruder.deps, { approachId: approach.id, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("material on Supabase (HU-13)", () => {
  async function inObra() {
    const g = await newGroup(`Material ${run}`);
    const invite = await createInvite(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id });
    await acceptInvite(ana.deps, { token: invite.token, userId: ana.id });
    const project = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Cristina" });
    const other = await createProject(owner.deps, { id: randomUUID(), groupId: g.id, userId: owner.id, title: "Otra" });
    const session = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, projectId: project.id });
    const elsewhere = await createSession(ana.deps, { id: randomUUID(), groupId: g.id, userId: ana.id, projectId: other.id });
    const approach = await addApproach(ana.deps, { id: randomUUID(), sessionId: session.id, userId: ana.id, text: "Calentamiento" });
    return { g, project, session, elsewhere, approach };
  }
  const photo = { kind: "photo", mime: "image/jpeg", sizeBytes: 4000, title: "Parada de cabeza" } as const;
  const register = (actor: typeof owner, projectId: string, material: Parameters<typeof registerMedia>[1]["material"], where: object = {}) =>
    registerMedia(actor.deps, { id: randomUUID(), projectId, userId: actor.id, material, ...where });

  it("a member registers a photo (pending), confirms it, and the group reads it; links and notes are ready at once", async () => {
    const { project, session, approach } = await inObra();
    const { media, upload } = await register(ana, project.id, photo, { approachId: approach.id });
    expect(media).toMatchObject({ status: "pending", sessionId: session.id, approachId: approach.id });
    expect(upload?.method).toBe("PUT");

    // A pending upload belongs to its author alone; nobody else can open it yet.
    expect(await listMedia(owner.deps, { projectId: project.id, userId: owner.id })).toEqual([]);
    await expect(confirmUpload(ana.deps, { mediaId: media.id, userId: ana.id })).rejects.toBeInstanceOf(ConflictError); // not in the store yet

    files.put(media.path!, 4000);
    expect((await confirmUpload(ana.deps, { mediaId: media.id, userId: ana.id })).status).toBe("uploaded");
    const seen = await listMedia(owner.deps, { projectId: project.id, userId: owner.id, approachId: approach.id });
    expect(seen.map((m) => m.id)).toEqual([media.id]);
    expect((await getMediaUrl(owner.deps, { mediaId: media.id, userId: owner.id })).url).toContain(media.path!);

    const link = await register(ana, project.id, { kind: "link", url: "https://youtu.be/abc" });
    expect(link.media.status).toBe("uploaded");
    expect((await register(ana, project.id, { kind: "note", body: "Salió bien" })).media.body).toBe("Salió bien");
  });

  it("the author or an admin removes it; another member cannot", async () => {
    const { project } = await inObra();
    const mine = (await register(ana, project.id, { kind: "note", body: "Mía" })).media;
    const theirs = (await register(owner, project.id, { kind: "note", body: "De la admin" })).media;
    await expect(removeMedia(ana.deps, { mediaId: theirs.id, userId: ana.id })).rejects.toBeInstanceOf(ForbiddenError);
    await removeMedia(owner.deps, { mediaId: mine.id, userId: owner.id }); // admin, someone else's
    expect((await listMedia(ana.deps, { projectId: project.id, userId: ana.id })).map((m) => m.id)).toEqual([theirs.id]);
    expect((await db.ana!.rpc("remove_media", { p_media: theirs.id })).error).not.toBeNull(); // bypassing the core
  });

  it("the database refuses what bypasses the core: other authors, other groups, mismatched sessions, direct edits", async () => {
    const { g, project, session, elsewhere } = await inObra();
    const row = (extra: object = {}) => ({
      id: randomUUID(), group_id: g.id, project_id: project.id, kind: "note", body: "x", status: "uploaded", created_by: ana.id, ...extra,
    });
    const file = { kind: "photo", path: "x", mime: "image/jpeg", size_bytes: 10, body: null };

    expect((await db.ana!.from("media").insert(row())).error).toBeNull();
    expect((await db.ana!.from("media").insert(row({ created_by: owner.id }))).error).not.toBeNull(); // as someone else
    expect((await db.intruder!.from("media").insert(row({ created_by: intruder.id }))).error).not.toBeNull(); // not in the group
    expect((await db.ana!.from("media").insert(row({ session_id: elsewhere.id }))).error).not.toBeNull(); // session of another obra
    expect((await db.ana!.from("media").insert(row({ session_id: session.id }))).error).toBeNull(); // its own
    expect((await db.ana!.from("media").insert(row({ ...file, status: "uploaded" }))).error).not.toBeNull(); // a file must start pending
    expect((await db.ana!.from("media").insert(row({ kind: "note", body: "   " }))).error).not.toBeNull();
    expect((await db.ana!.from("media").insert(row({ ...file, status: "pending", size_bytes: 99_999_999 }))).error).not.toBeNull(); // too big

    const mine = row({ ...file, status: "pending", path: `grupos/${g.id}/obras/${project.id}/zz.jpg` });
    expect((await db.ana!.from("media").insert(mine)).error).toBeNull();
    expect((await db.ana!.from("media").update({ status: "uploaded" }).eq("id", mine.id)).error).not.toBeNull(); // only through confirm_media
    expect((await db.owner!.rpc("confirm_media", { p_media: mine.id })).error).not.toBeNull(); // not the author
    expect((await db.owner!.from("media").select("id").eq("id", mine.id)).data ?? []).toEqual([]); // pending: only the author sees it
    expect((await db.intruder!.from("media").select("id").eq("project_id", project.id)).data ?? []).toEqual([]);
    expect((await db.ana!.rpc("confirm_media", { p_media: mine.id })).error).toBeNull();
    await expect(
      registerMedia(intruder.deps, { id: randomUUID(), projectId: project.id, userId: intruder.id, material: photo }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// The real bucket: signs, uploads one small object with the signed address, reads it back, deletes it.
const r2Env = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].map((k) => process.env[k]);
describe.skipIf(r2Env.some((v) => !v))("R2 (HU-13)", () => {
  it("uploads with a signed address, checks size, reads with a signed address, and deletes", async () => {
    const [accountId, accessKeyId, secretAccessKey, bucket] = r2Env as string[];
    const store = new R2FileStore({ accountId: accountId!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey!, bucket: bucket! });
    const path = `pruebas/${run}/hola.txt`;
    const body = "hola desde art-flux";

    try {
      expect(await store.head(path)).toBeNull();
      const upload = await store.signUpload({ path, mime: "text/plain", sizeBytes: body.length });
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
      expect(put.status).toBe(200);
      expect(await store.head(path)).toEqual({ sizeBytes: body.length });

      const download = await store.signDownload(path, 60);
      expect(await (await fetch(download.url)).text()).toBe(body);

      // The signature covers the size: an upload of another size is rejected.
      const other = await store.signUpload({ path: `${path}.otro`, mime: "text/plain", sizeBytes: 3 });
      const bad = await fetch(other.url, { method: "PUT", headers: other.headers, body: "demasiado largo" });
      expect(bad.ok).toBe(false);
    } finally {
      await store.delete(path);
      await store.delete(`${path}.otro`);
    }
    expect(await store.head(path)).toBeNull();
  });
});
