import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InMemoryGroupsRepo,
  InMemoryProjectsRepo,
  InMemorySessionsRepo,
  NotFoundError,
  SessionNumberTakenError,
  attachOriginSession,
  createGroup,
  createProject,
  createProjectWithOrigin,
  createSession,
  getSession,
  listAttendees,
  listSessions,
  markCompleted,
  updateAttendees,
  updateSession,
  type Session,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const sessions = new InMemorySessionsRepo(projects);
  const deps = { groups, projects, sessions, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  let n = 0;
  return {
    groups,
    projects,
    sessions,
    deps,
    session: (userId: string, extra: object = {}) =>
      createSession(deps, { id: `s${++n}`, groupId: "g1", userId, ...extra }),
    project: (title: string) => createProject(deps, { id: `p-${title}`, groupId: "g1", userId: "admin", title }),
  };
}

describe("createSession (HU-07)", () => {
  it("is born planned and numbers itself inside the group", async () => {
    const { session } = await setup();
    const a = await session("ana", { objective: " Reencuentro " });
    const b = await session("ana");
    expect(a).toMatchObject({ number: 1, status: "planned", groupId: "g1", createdBy: "ana", objective: "Reencuentro" });
    expect(a.projectId).toBeUndefined();
    expect(b.number).toBe(2);
  });

  it("numbers inside each project separately from the group", async () => {
    const { session, project } = await setup();
    const cristina = await project("Cristina");
    const otra = await project("Otra");
    await session("ana"); // group S01
    const c1 = await session("ana", { projectId: cristina.id });
    const c2 = await session("ana", { projectId: cristina.id });
    const o1 = await session("ana", { projectId: otra.id });
    expect([c1.number, c2.number, o1.number]).toEqual([1, 2, 1]);
  });

  it("accepts a date, a past date, or none (pending)", async () => {
    const { session } = await setup();
    expect((await session("ana", { date: "2026-12-24" })).date).toBe("2026-12-24");
    expect((await session("ana", { date: "2020-01-05" })).date).toBe("2020-01-05"); // already happened
    expect((await session("ana")).date).toBeUndefined();
    expect((await session("ana", { date: null })).date).toBeUndefined();
  });

  it("rejects impossible dates and over-long texts", async () => {
    const { session } = await setup();
    for (const date of ["2026-02-30", "26-11-02", "mañana", "2026-13-01"]) {
      await expect(session("ana", { date })).rejects.toThrow();
    }
    await expect(session("ana", { objective: "x".repeat(1001) })).rejects.toThrow();
    await expect(session("ana", { place: "x".repeat(121) })).rejects.toThrow();
  });

  it("keeps place and objective optional and trims them", async () => {
    const { session } = await setup();
    const s = await session("ana", { place: "  U. Nacional ", objective: "   " });
    expect(s.place).toBe("U. Nacional");
    expect(s.objective).toBeUndefined();
  });

  it("is for members only, and a project must belong to the group", async () => {
    const { deps, session } = await setup();
    await expect(
      createSession(deps, { id: "x", groupId: "g1", userId: "stranger" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(session("ana", { projectId: "missing" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("retries when someone takes the number in between", async () => {
    const { sessions, session } = await setup();
    const original = sessions.create.bind(sessions);
    let first = true;
    sessions.create = async (s: Session) => {
      if (first) {
        first = false;
        throw new SessionNumberTakenError(s.number);
      }
      return original(s);
    };
    expect((await session("ana")).number).toBe(1);
  });
});

describe("reading sessions", () => {
  it("lists by scope and finds a session by its address", async () => {
    const { deps, session, project } = await setup();
    const cristina = await project("Cristina");
    await session("ana");
    await session("ana", { projectId: cristina.id, objective: "Analizar" });

    const all = await listSessions(deps, { groupId: "g1", userId: "ana" });
    const groupOnly = await listSessions(deps, { groupId: "g1", userId: "ana", projectId: null });
    const inProject = await listSessions(deps, { groupId: "g1", userId: "ana", projectId: cristina.id });
    expect([all.length, groupOnly.length, inProject.length]).toEqual([2, 1, 1]);

    expect((await getSession(deps, { groupId: "g1", userId: "ana", number: 1 })).projectId).toBeUndefined();
    const s = await getSession(deps, { groupId: "g1", userId: "ana", number: 1, projectSlug: "cristina" });
    expect(s.objective).toBe("Analizar");
  });

  it("hides sessions from outsiders and reports missing ones", async () => {
    const { deps, session } = await setup();
    await session("ana");
    await expect(listSessions(deps, { groupId: "g1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSession(deps, { groupId: "g1", userId: "ana", number: 9 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getSession(deps, { groupId: "g1", userId: "ana", number: 1, projectSlug: "nada" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateSession", () => {
  it("lets the admin or the creator edit, and clears fields with null or empty text", async () => {
    const { deps, session } = await setup();
    const s = await session("ana", { date: "2026-12-01", place: "Casa", objective: "Algo" });

    const byCreator = await updateSession(deps, { sessionId: s.id, userId: "ana", changes: { place: "Teatro" } });
    expect(byCreator).toMatchObject({ place: "Teatro", objective: "Algo", date: "2026-12-01" });

    const byAdmin = await updateSession(deps, {
      sessionId: s.id,
      userId: "admin",
      changes: { date: null, objective: "  " },
    });
    expect(byAdmin.date).toBeUndefined();
    expect(byAdmin.objective).toBeUndefined();
    expect(byAdmin.place).toBe("Teatro");
  });

  it("refuses other members and outsiders, and bad dates", async () => {
    const { deps, groups, session } = await setup();
    groups.members.push({ groupId: "g1", userId: "luis", role: "member" });
    const s = await session("ana");
    await expect(
      updateSession(deps, { sessionId: s.id, userId: "luis", changes: { place: "x" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateSession(deps, { sessionId: s.id, userId: "stranger", changes: { place: "x" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateSession(deps, { sessionId: s.id, userId: "ana", changes: { date: "ayer" } }),
    ).rejects.toThrow();
  });
});

describe("attachOriginSession (HU-05)", () => {
  it("moves the group session into the project as S01 and records the origin", async () => {
    const { deps, projects, session, project } = await setup();
    const s1 = await session("ana", { objective: "Reencuentro" }); // group S01
    const s2 = await session("ana"); // group S02
    const cristina = await project("Cristina");

    const attached = await attachOriginSession(deps, { projectId: cristina.id, sessionId: s1.id, userId: "admin" });
    expect(attached).toMatchObject({ id: s1.id, projectId: cristina.id, number: 1 });
    expect((await projects.getById(cristina.id))?.originSessionId).toBe(s1.id);

    // The other group session keeps its place; the next project session continues after S01.
    expect((await getSession(deps, { groupId: "g1", userId: "ana", number: 2 })).id).toBe(s2.id);
    const next = await createSession(deps, { id: "n", groupId: "g1", userId: "ana", projectId: cristina.id });
    expect(next.number).toBe(2);
  });

  it("takes the next number when the project already has sessions", async () => {
    const { deps, session, project } = await setup();
    const cristina = await project("Cristina");
    await session("ana", { projectId: cristina.id }); // project S01
    const grupal = await session("ana");
    const attached = await attachOriginSession(deps, { projectId: cristina.id, sessionId: grupal.id, userId: "admin" });
    expect(attached.number).toBe(2);
  });

  it("refuses non-admins, foreign sessions, adopted sessions and a second origin", async () => {
    const { deps, session, project } = await setup();
    const cristina = await project("Cristina");
    const otra = await project("Otra");
    const s1 = await session("ana");
    const s2 = await session("ana");

    await expect(
      attachOriginSession(deps, { projectId: cristina.id, sessionId: s1.id, userId: "ana" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      attachOriginSession(deps, { projectId: cristina.id, sessionId: "missing", userId: "admin" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await attachOriginSession(deps, { projectId: cristina.id, sessionId: s1.id, userId: "admin" });
    await expect(
      attachOriginSession(deps, { projectId: otra.id, sessionId: s1.id, userId: "admin" }),
    ).rejects.toBeInstanceOf(ConflictError); // already belongs to a project
    await expect(
      attachOriginSession(deps, { projectId: cristina.id, sessionId: s2.id, userId: "admin" }),
    ).rejects.toBeInstanceOf(ConflictError); // project already has an origin
  });

  it("retries when the project number is taken in between", async () => {
    const { deps, sessions, session, project } = await setup();
    const cristina = await project("Cristina");
    const s = await session("ana");
    const original = sessions.attachAsOrigin.bind(sessions);
    let first = true;
    sessions.attachAsOrigin = async (...args: Parameters<typeof original>) => {
      if (first) {
        first = false;
        throw new SessionNumberTakenError(args[2]);
      }
      return original(...args);
    };
    expect((await attachOriginSession(deps, { projectId: cristina.id, sessionId: s.id, userId: "admin" })).number).toBe(1);
  });
});

describe("createProjectWithOrigin", () => {
  it("creates the project and adopts the session in one go", async () => {
    const { deps, session } = await setup();
    const s = await session("ana", { objective: "Reencuentro" });
    const { project, origin } = await createProjectWithOrigin(deps, {
      id: "p1",
      groupId: "g1",
      userId: "admin",
      title: "Cristina",
      originSessionId: s.id,
    });
    expect(project.originSessionId).toBe(s.id);
    expect(origin).toMatchObject({ id: s.id, projectId: "p1", number: 1 });
  });

  it("creates a plain project when there is no origin", async () => {
    const { deps } = await setup();
    const { project, origin } = await createProjectWithOrigin(deps, {
      id: "p1",
      groupId: "g1",
      userId: "admin",
      title: "Sola",
    });
    expect(project.originSessionId).toBeUndefined();
    expect(origin).toBeUndefined();
  });

  it("leaves no half-made project when the origin is invalid or the user is not admin", async () => {
    const { deps, projects, session } = await setup();
    const s = await session("ana");
    await expect(
      createProjectWithOrigin(deps, { id: "p1", groupId: "g1", userId: "admin", title: "X", originSessionId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createProjectWithOrigin(deps, { id: "p2", groupId: "g1", userId: "ana", title: "Y", originSessionId: s.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(projects.projects).toHaveLength(0);
  });

  it("never gives a project a session address as slug", async () => {
    const { project } = await setup();
    expect((await project("S01")).slug).toBe("s01-2");
    expect((await project("s02")).slug).toBe("s02-2");
  });
});

describe("markCompleted (HU-11)", () => {
  it("any member closes a planned session and saves who attended", async () => {
    const { deps, session } = await setup();
    const s = await session("admin");
    const done = await markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: ["admin", "ana", "ana"] });
    expect(done.status).toBe("completed");
    const who = await listAttendees(deps, { sessionId: s.id, userId: "admin" });
    expect(who.sort()).toEqual(["admin", "ana"]);
  });

  it("refuses outsiders, a session already held, and attendees from outside the group", async () => {
    const { deps, session } = await setup();
    const s = await session("admin");
    await expect(markCompleted(deps, { sessionId: s.id, userId: "stranger", attendeeIds: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(markCompleted(deps, { sessionId: "missing", userId: "ana", attendeeIds: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: ["stranger"] })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await deps.sessions.getById(s.id))?.status).toBe("planned"); // nothing half-done

    await markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: [] });
    await expect(markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: [] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows nobody marked (an empty list)", async () => {
    const { deps, session } = await setup();
    const s = await session("admin");
    await markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: [] });
    expect(await listAttendees(deps, { sessionId: s.id, userId: "ana" })).toEqual([]);
  });
});

describe("updateAttendees (HU-11)", () => {
  it("corrects who attended after the session was held, and not before", async () => {
    const { deps, session } = await setup();
    const s = await session("admin");
    await expect(updateAttendees(deps, { sessionId: s.id, userId: "ana", attendeeIds: ["ana"] })).rejects.toBeInstanceOf(ConflictError);

    await markCompleted(deps, { sessionId: s.id, userId: "ana", attendeeIds: ["admin", "ana"] });
    await updateAttendees(deps, { sessionId: s.id, userId: "admin", attendeeIds: ["ana"] });
    expect(await listAttendees(deps, { sessionId: s.id, userId: "ana" })).toEqual(["ana"]);
    await expect(updateAttendees(deps, { sessionId: s.id, userId: "ana", attendeeIds: ["stranger"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAttendees(deps, { sessionId: s.id, userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
