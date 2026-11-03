// Offline route tests: fake auth + in-memory repos from the core.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InMemoryApproachesRepo,
  InMemoryFindingsRepo,
  InMemoryGroupsRepo,
  InMemoryInvitesRepo,
  InMemoryProjectsRepo,
  InMemorySessionsRepo,
  randomTokenGenerator,
} from "@art-flux/core";
import { createApp } from "./app";

function setup() {
  const groups = new InMemoryGroupsRepo();
  const invites = new InMemoryInvitesRepo(groups);
  const clock = { now: () => new Date() };
  const projects = new InMemoryProjectsRepo();
  const sessionsRepo = new InMemorySessionsRepo(projects);
  const approaches = new InMemoryApproachesRepo();
  const findings = new InMemoryFindingsRepo();
  const deps = { groups, invites, projects, sessions: sessionsRepo, approaches, findings, clock, tokens: randomTokenGenerator };
  const sessions: Record<string, string> = { "tok-owner": "owner", "tok-ana": "ana", "tok-luis": "luis" };
  const app = createApp({
    authenticator: {
      authenticate: async (t) => (sessions[t] ? { userId: sessions[t]!, credential: t } : null),
    },
    depsFor: () => deps,
  });
  const call = (token: string | null, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return { call };
}

describe("auth", () => {
  it("serves /health without a session", async () => {
    const { call } = setup();
    expect((await call(null, "GET", "/health")).status).toBe(200);
  });

  it("rejects missing, malformed and unknown tokens with 401", async () => {
    const { call } = setup();
    for (const token of [null, "", "tok-nadie"]) {
      const res = await call(token, "GET", "/me/start");
      expect(res.status).toBe(401);
    }
  });
});

describe("groups", () => {
  it("tells a new user to create a group, then goes straight to it", async () => {
    const { call } = setup();
    expect(await (await call("tok-owner", "GET", "/me/start")).json()).toEqual({ destination: "none" });

    const res = await call("tok-owner", "POST", "/groups", { name: "Conversonantes", city: "Medellín" });
    expect(res.status).toBe(201);
    const group = await res.json();
    expect(group).toMatchObject({ name: "Conversonantes", handle: "conversonantes", city: "Medellín" });

    const start = await (await call("tok-owner", "GET", "/me/start")).json();
    expect(start).toMatchObject({ destination: "group", group: { id: group.id } });
  });

  it("returns 400 with a Spanish message when the name is missing", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "POST", "/groups", { name: "  " });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("El grupo necesita un nombre");
  });

  it("returns 400 for a body that is not a JSON object", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "POST", "/groups", [1, 2]);
    expect(res.status).toBe(400);
  });
});

describe("invitations", () => {
  async function withGroup() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    return { ...s, group };
  }

  it("full flow over HTTP: create, accept, single use, list, revoke", async () => {
    const { call, group } = await withGroup();

    const created = await call("tok-owner", "POST", `/groups/${group.id}/invites`, { label: "para Ana" });
    expect(created.status).toBe(201);
    const invite = await created.json();
    expect(invite.token).toHaveLength(43);

    const accepted = await call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).id).toBe(group.id);

    const second = await call("tok-luis", "POST", "/invites/accept", { token: invite.token });
    expect(second.status).toBe(410);
    expect((await second.json()).error).toBe("invite_invalid");

    const list = await (await call("tok-owner", "GET", `/groups/${group.id}/invites`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: "para Ana", acceptedBy: "ana" });

    expect((await call("tok-owner", "DELETE", `/invites/${invite.id}`)).status).toBe(204);
    expect((await call("tok-owner", "DELETE", `/invites/${invite.id}`)).status).toBe(204);
  });

  it("only admins can create, list or revoke (403)", async () => {
    const { call, group } = await withGroup();
    const invite = await (await call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await call("tok-ana", "POST", "/invites/accept", { token: invite.token });

    expect((await call("tok-ana", "POST", `/groups/${group.id}/invites`, {})).status).toBe(403);
    expect((await call("tok-ana", "GET", `/groups/${group.id}/invites`)).status).toBe(403);
    expect((await call("tok-ana", "DELETE", `/invites/${invite.id}`)).status).toBe(403);
    expect((await call("tok-luis", "GET", `/groups/${group.id}/invites`)).status).toBe(403);
  });

  it("validates ids and the token in the body", async () => {
    const { call, group } = await withGroup();
    expect((await call("tok-owner", "GET", "/groups/no-es-uuid/invites")).status).toBe(400);
    expect((await call("tok-owner", "DELETE", "/invites/no-es-uuid")).status).toBe(400);
    expect((await call("tok-owner", "POST", `/groups/${group.id}/invites`, { id: "x" })).status).toBe(400);
    expect((await call("tok-ana", "POST", "/invites/accept", {})).status).toBe(400);
  });

  it("answers 410 for an unknown link, and 403 when revoking an unknown id", async () => {
    const { call } = await withGroup();
    expect((await call("tok-ana", "POST", "/invites/accept", { token: "nope" })).status).toBe(410);
    expect((await call("tok-owner", "DELETE", `/invites/${randomUUID()}`)).status).toBe(403);
  });
});

describe("my groups", () => {
  it("lists only the groups of the caller", async () => {
    const { call } = setup();
    await call("tok-owner", "POST", "/groups", { name: "Uno" });
    await call("tok-ana", "POST", "/groups", { name: "Dos" });
    const mine = await (await call("tok-owner", "GET", "/me/groups")).json();
    expect(mine.map((g: { name: string }) => g.name)).toEqual(["Uno"]);
  });
});

describe("members", () => {
  it("lists members to members only", async () => {
    const { call } = setup();
    const group = await (await call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const res = await call("tok-owner", "GET", `/groups/${group.id}/members`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ userId: "owner", role: "admin" }]);
    expect((await call("tok-ana", "GET", `/groups/${group.id}/members`)).status).toBe(403);
    expect((await call("tok-owner", "GET", "/groups/nope/members")).status).toBe(400);
  });
});

describe("projects and team", () => {
  async function withGroup() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await s.call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await s.call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    return { ...s, group };
  }

  it("creates, reads, lists and edits a project", async () => {
    const { call, group } = await withGroup();
    const created = await call("tok-owner", "POST", `/groups/${group.id}/projects`, {
      title: "Cristina",
      status: "staging",
      themes: ["#Memoria"],
      visibilityAgreement: "Solo fotos",
    });
    expect(created.status).toBe(201);
    const project = await created.json();
    expect(project).toMatchObject({ slug: "cristina", status: "staging", themes: ["memoria"] });

    const read = await call("tok-ana", "GET", `/groups/${group.id}/projects/cristina`);
    expect((await read.json()).id).toBe(project.id);
    const list = await (await call("tok-ana", "GET", `/groups/${group.id}/projects`)).json();
    expect(list).toHaveLength(1);

    const patched = await call("tok-owner", "PATCH", `/projects/${project.id}`, { title: "Cristina 2", status: "running" });
    expect(await patched.json()).toMatchObject({ slug: "cristina", title: "Cristina 2", status: "running" });
  });

  it("answers 400 for bad input, 403 for members and 404 for outsiders and unknown slugs", async () => {
    const { call, group } = await withGroup();
    const url = `/groups/${group.id}/projects`;
    expect((await call("tok-owner", "POST", url, { title: "  " })).status).toBe(400);
    expect((await call("tok-owner", "POST", url, { title: "X", status: "volando" })).status).toBe(400);
    expect((await call("tok-ana", "POST", url, { title: "Mia" })).status).toBe(403);
    expect((await call("tok-luis", "GET", url)).status).toBe(404);
    expect((await call("tok-owner", "GET", `${url}/no-existe`)).status).toBe(404);
  });

  it("manages the team with roles, for members to read and admins to write", async () => {
    const { call, group } = await withGroup();
    const project = await (await call("tok-owner", "POST", `/groups/${group.id}/projects`, { title: "Cristina" })).json();
    const team = `/projects/${project.id}/team`;

    const outsider = "00000000-0000-4000-8000-000000000001";
    // An admin cannot put someone outside the group on the team.
    expect((await call("tok-owner", "PUT", `${team}/${outsider}`, { roles: ["actor"] })).status).toBe(403);
    expect((await call("tok-ana", "PUT", `${team}/${outsider}`, { roles: ["actor"] })).status).toBe(403); // a member cannot edit it at all
    expect((await call("tok-owner", "PUT", `${team}/not-a-uuid`, { roles: [] })).status).toBe(400);
    expect((await call("tok-owner", "GET", `/projects/not-a-uuid/team`)).status).toBe(400);
    expect((await call("tok-luis", "GET", team)).status).toBe(404);
  });
});

describe("misc", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "GET", "/nada");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

describe("sessions (HU-07) and project origin (HU-05)", () => {
  async function withGroup() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await s.call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await s.call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    return { ...s, group, sessionsUrl: `/groups/${group.id}/sessions` };
  }

  it("creates numbered sessions for the group and for a project, with a past date", async () => {
    const { call, group, sessionsUrl } = await withGroup();
    const project = await (await call("tok-owner", "POST", `/groups/${group.id}/projects`, { title: "Cristina" })).json();

    const g1 = await call("tok-ana", "POST", sessionsUrl, { date: "2020-01-05", place: "Casa", objective: "Reencuentro" });
    expect(g1.status).toBe(201);
    expect(await g1.json()).toMatchObject({ number: 1, status: "planned", date: "2020-01-05" });
    expect((await (await call("tok-ana", "POST", sessionsUrl, {})).json()).number).toBe(2);
    const p1 = await (await call("tok-ana", "POST", sessionsUrl, { projectId: project.id })).json();
    expect(p1).toMatchObject({ number: 1, projectId: project.id });

    const groupLevel = await (await call("tok-ana", "GET", `${sessionsUrl}?project=none`)).json();
    const inProject = await (await call("tok-ana", "GET", `${sessionsUrl}?project=${project.id}`)).json();
    const all = await (await call("tok-ana", "GET", sessionsUrl)).json();
    expect([groupLevel.length, inProject.length, all.length]).toEqual([2, 1, 3]);
  });

  it("finds a session by its address and lets its creator edit it", async () => {
    const { call, group, sessionsUrl } = await withGroup();
    await call("tok-owner", "POST", `/groups/${group.id}/projects`, { title: "Cristina" });
    const project = await (await call("tok-owner", "GET", `/groups/${group.id}/projects/cristina`)).json();
    const created = await (await call("tok-ana", "POST", sessionsUrl, { projectId: project.id, objective: "Analizar" })).json();

    const found = await call("tok-ana", "GET", `${sessionsUrl}/1?project=cristina`);
    expect((await found.json()).id).toBe(created.id);
    expect((await call("tok-ana", "GET", `${sessionsUrl}/1`)).status).toBe(404); // group-level S01 does not exist

    const patched = await call("tok-ana", "PATCH", `/sessions/${created.id}`, { place: "U. Nacional", objective: "" });
    expect(await patched.json()).toMatchObject({ place: "U. Nacional" });
    expect((await call("tok-owner", "PATCH", `/sessions/${created.id}`, { date: "2026-12-01" })).status).toBe(200);
  });

  it("validates input: 400 for bad dates and numbers, 404 for outsiders", async () => {
    const { call, sessionsUrl } = await withGroup();
    expect((await call("tok-ana", "POST", sessionsUrl, { date: "2026-02-30" })).status).toBe(400);
    expect((await call("tok-ana", "GET", `${sessionsUrl}/cero`)).status).toBe(400);
    expect((await call("tok-ana", "GET", `${sessionsUrl}?project=no-uuid`)).status).toBe(400);
    expect((await call("tok-luis", "GET", sessionsUrl)).status).toBe(404);
    expect((await call("tok-luis", "POST", sessionsUrl, {})).status).toBe(404);
  });

  it("creates a project born from a group session, which renumbers into the project", async () => {
    const { call, group, sessionsUrl } = await withGroup();
    const session = await (await call("tok-ana", "POST", sessionsUrl, { objective: "Reencuentro" })).json();

    const created = await call("tok-owner", "POST", `/groups/${group.id}/projects`, {
      title: "Cristina",
      originSessionId: session.id,
    });
    expect(created.status).toBe(201);
    const project = await created.json();
    expect(project.originSessionId).toBe(session.id);

    const moved = await (await call("tok-ana", "GET", `${sessionsUrl}/1?project=cristina`)).json();
    expect(moved).toMatchObject({ id: session.id, projectId: project.id, number: 1 });
    expect((await call("tok-ana", "GET", `${sessionsUrl}/1`)).status).toBe(404); // left the group scope
  });

  it("answers 409 when the origin already belongs to a project, and 403 for non-admins", async () => {
    const { call, group, sessionsUrl } = await withGroup();
    const session = await (await call("tok-ana", "POST", sessionsUrl, {})).json();
    const url = `/groups/${group.id}/projects`;
    expect((await call("tok-owner", "POST", url, { title: "Una", originSessionId: session.id })).status).toBe(201);
    expect((await call("tok-owner", "POST", url, { title: "Dos", originSessionId: session.id })).status).toBe(409);
    expect((await call("tok-ana", "POST", url, { title: "Tres", originSessionId: session.id })).status).toBe(403);
    expect((await call("tok-owner", "POST", url, { title: "Cuatro", originSessionId: "no-uuid" })).status).toBe(400);
  });
});

describe("approaches (HU-08)", () => {
  async function withSession() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await s.call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await s.call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    const session = await (await s.call("tok-ana", "POST", `/groups/${group.id}/sessions`, { objective: "Analizar" })).json();
    return { ...s, group, session, url: `/sessions/${session.id}/approaches` };
  }

  it("adds, lists, edits and removes approaches", async () => {
    const { call, url } = await withSession();
    const created = await call("tok-ana", "POST", url, { text: "  Calentamiento " });
    expect(created.status).toBe(201);
    const a = await created.json();
    expect(a).toMatchObject({ text: "Calentamiento", position: 1, ownerId: "ana" });

    const list = await (await call("tok-owner", "GET", url)).json();
    expect(list).toHaveLength(1);

    const patched = await call("tok-owner", "PATCH", `/approaches/${a.id}`, { text: "Calentamiento corporal" });
    expect(await patched.json()).toMatchObject({ text: "Calentamiento corporal" });

    expect((await call("tok-ana", "DELETE", `/approaches/${a.id}`)).status).toBe(204);
    expect(await (await call("tok-ana", "GET", url)).json()).toEqual([]);
    expect((await call("tok-ana", "DELETE", `/approaches/${a.id}`)).status).toBe(404);
  });

  it("reorders with the full list and answers 409 when the list does not match", async () => {
    const { call, url } = await withSession();
    const ids: string[] = [];
    for (const text of ["Uno", "Dos", "Tres"]) ids.push((await (await call("tok-ana", "POST", url, { text })).json()).id);

    const reordered = await call("tok-owner", "PUT", `${url}/order`, { ids: [ids[2], ids[0], ids[1]] });
    expect(reordered.status).toBe(200);
    expect((await reordered.json()).map((x: { text: string }) => x.text)).toEqual(["Tres", "Uno", "Dos"]);

    expect((await call("tok-ana", "PUT", `${url}/order`, { ids: [ids[0]] })).status).toBe(409);
    expect((await call("tok-ana", "PUT", `${url}/order`, { ids: "no" })).status).toBe(400);
  });

  it("validates input and hides the session from outsiders", async () => {
    const { call, url } = await withSession();
    expect((await call("tok-ana", "POST", url, { text: "  " })).status).toBe(400);
    expect((await call("tok-ana", "POST", url, { text: "Algo", ownerId: "no-uuid" })).status).toBe(400);
    expect((await call("tok-luis", "GET", url)).status).toBe(404);
    expect((await call("tok-luis", "POST", url, { text: "Algo" })).status).toBe(404);
    expect((await call("tok-ana", "GET", "/sessions/no-uuid/approaches")).status).toBe(400);
  });
});

describe("home (HU-09)", () => {
  it("gives my approaches and the upcoming sessions, and hides the group from outsiders", async () => {
    const { call } = setup();
    const group = await (await call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    const session = await (await call("tok-ana", "POST", `/groups/${group.id}/sessions`, { objective: "Analizar" })).json();
    await call("tok-ana", "POST", `/sessions/${session.id}/approaches`, { text: "Calentamiento" });
    await call("tok-ana", "POST", `/sessions/${session.id}/approaches`, { text: "Otro" });
    await call("tok-owner", "POST", `/sessions/${session.id}/approaches`, { text: "De la dueña" });

    const home = await (await call("tok-ana", "GET", `/groups/${group.id}/home`)).json();
    expect(home.toRecord).toEqual([]);
    expect(home.mine.map((m: { approach: { text: string } }) => m.approach.text)).toEqual(["Calentamiento", "Otro"]);
    expect(home.upcoming).toMatchObject([{ session: { id: session.id }, approachCount: 3 }]);

    expect((await call("tok-luis", "GET", `/groups/${group.id}/home`)).status).toBe(404);
    expect((await call("tok-ana", "GET", "/groups/no-uuid/home")).status).toBe(400);
  });
});

describe("held sessions (HU-11)", () => {
  it("marks a session as held, lists and corrects attendees, and refuses repeats", async () => {
    const { call } = setup();
    const group = await (await call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    const session = await (await call("tok-ana", "POST", `/groups/${group.id}/sessions`, { objective: "Analizar" })).json();

    // Test users are not UUIDs, so the happy path sends nobody; the error paths use real-looking ids.
    expect((await call("tok-ana", "PUT", `/sessions/${session.id}/attendees`, { attendeeIds: [] })).status).toBe(409); // not held yet
    const done = await call("tok-ana", "POST", `/sessions/${session.id}/complete`, { attendeeIds: [] });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ id: session.id, status: "completed" });
    expect((await call("tok-ana", "POST", `/sessions/${session.id}/complete`, { attendeeIds: [] })).status).toBe(409);

    expect(await (await call("tok-owner", "GET", `/sessions/${session.id}/attendees`)).json()).toEqual([]);
    expect((await call("tok-ana", "PUT", `/sessions/${session.id}/attendees`, { attendeeIds: [] })).status).toBe(200);
    // Held: its planning is frozen.
    expect((await call("tok-ana", "POST", `/sessions/${session.id}/approaches`, { text: "Tarde" })).status).toBe(409);
  });

  it("validates ids, keeps outsiders out and refuses people from outside the group", async () => {
    const { call } = setup();
    const group = await (await call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const session = await (await call("tok-owner", "POST", `/groups/${group.id}/sessions`, {})).json();
    const url = `/sessions/${session.id}`;
    expect((await call("tok-owner", "POST", `${url}/complete`, {})).status).toBe(400);
    expect((await call("tok-owner", "POST", `${url}/complete`, { attendeeIds: ["no-uuid"] })).status).toBe(400);
    expect((await call("tok-owner", "POST", `${url}/complete`, { attendeeIds: [randomUUID()] })).status).toBe(403);
    expect((await call("tok-luis", "POST", `${url}/complete`, { attendeeIds: [] })).status).toBe(404);
    expect((await call("tok-luis", "GET", `${url}/attendees`)).status).toBe(404);
    expect((await call("tok-owner", "POST", "/sessions/no-uuid/complete", { attendeeIds: [] })).status).toBe(400);
  });
});

describe("approach note «cómo lo planteo»", () => {
  it("only the owner writes it, everyone reads it, and empty clears it", async () => {
    const { call } = setup();
    const group = await (await call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    const session = await (await call("tok-ana", "POST", `/groups/${group.id}/sessions`, {})).json();
    const a = await (await call("tok-ana", "POST", `/sessions/${session.id}/approaches`, { text: "Calentamiento" })).json();
    const url = `/approaches/${a.id}/note`;

    const saved = await call("tok-ana", "PUT", url, { note: "  Saludo al sol  " });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ id: a.id, note: "Saludo al sol" });
    const seen = await (await call("tok-owner", "GET", `/sessions/${session.id}/approaches`)).json();
    expect(seen[0].note).toBe("Saludo al sol");

    expect((await call("tok-owner", "PUT", url, { note: "mío" })).status).toBe(403); // not the owner
    expect((await call("tok-luis", "PUT", url, { note: "x" })).status).toBe(404); // outsider
    expect((await call("tok-ana", "PUT", url, { note: "x".repeat(2001) })).status).toBe(400);
    expect((await call("tok-ana", "PUT", "/approaches/no-uuid/note", { note: "x" })).status).toBe(400);

    const cleared = await (await call("tok-ana", "PUT", url, { note: "" })).json();
    expect(cleared.note).toBeUndefined();
  });
});

describe("findings (HU-12)", () => {
  async function heldApproach() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    const invite = await (await s.call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await s.call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    const session = await (await s.call("tok-ana", "POST", `/groups/${group.id}/sessions`, {})).json();
    const approach = await (await s.call("tok-ana", "POST", `/sessions/${session.id}/approaches`, { text: "Análisis" })).json();
    return { ...s, session, approach, url: `/approaches/${approach.id}/findings` };
  }
  const complete = (call: ReturnType<typeof setup>["call"], sessionId: string) =>
    call("tok-ana", "POST", `/sessions/${sessionId}/complete`, { attendeeIds: [] });

  it("writes, edits and removes fragments of a held session; the list shows their authors", async () => {
    const { call, session, approach, url } = await heldApproach();
    const f1 = randomUUID();
    const body = { approachId: approach.id, kind: "found", text: "Acciones claras" };

    expect((await call("tok-ana", "PUT", `/findings/${f1}`, body)).status).toBe(409); // not held yet
    await complete(call, session.id);

    const created = await call("tok-ana", "PUT", `/findings/${f1}`, body);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ id: f1, authorId: "ana", kind: "found", text: "Acciones claras" });
    await call("tok-ana", "PUT", `/findings/${f1}`, { ...body, text: "Acciones claras y separadas" });
    await call("tok-owner", "PUT", `/findings/${randomUUID()}`, { approachId: approach.id, kind: "missing", text: "Faltó el étude" });

    const list = await (await call("tok-ana", "GET", url)).json();
    expect(list.map((f: { authorId: string; text: string }) => [f.authorId, f.text])).toEqual([
      ["ana", "Acciones claras y separadas"],
      ["owner", "Faltó el étude"],
    ]);

    expect((await call("tok-ana", "DELETE", `/findings/${f1}`)).status).toBe(204);
    expect((await call("tok-ana", "DELETE", `/findings/${f1}`)).status).toBe(404);
    expect(await (await call("tok-ana", "GET", url)).json()).toHaveLength(1);
  });

  it("only the author changes or removes a fragment; outsiders and bad input are refused", async () => {
    const { call, session, approach, url } = await heldApproach();
    await complete(call, session.id);
    const f1 = randomUUID();
    const body = { approachId: approach.id, kind: "found", text: "Mío" };
    await call("tok-ana", "PUT", `/findings/${f1}`, body);

    expect((await call("tok-owner", "PUT", `/findings/${f1}`, { ...body, text: "Pisado" })).status).toBe(403);
    expect((await call("tok-owner", "DELETE", `/findings/${f1}`)).status).toBe(403);
    expect((await call("tok-luis", "GET", url)).status).toBe(404);
    expect((await call("tok-luis", "PUT", `/findings/${randomUUID()}`, body)).status).toBe(404);
    expect((await call("tok-ana", "PUT", `/findings/${randomUUID()}`, { ...body, text: "  " })).status).toBe(400);
    expect((await call("tok-ana", "PUT", `/findings/${randomUUID()}`, { ...body, kind: "otro" })).status).toBe(400);
    expect((await call("tok-ana", "PUT", "/findings/no-uuid", body)).status).toBe(400);
    expect((await call("tok-ana", "PUT", `/findings/${randomUUID()}`, { ...body, approachId: "no-uuid" })).status).toBe(400);
  });
});
