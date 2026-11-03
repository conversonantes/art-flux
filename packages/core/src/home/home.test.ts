import { describe, expect, it } from "vitest";
import {
  InMemoryApproachesRepo,
  InMemoryGroupsRepo,
  InMemoryProjectsRepo,
  InMemorySessionsRepo,
  NotFoundError,
  addApproach,
  createGroup,
  createSession,
  getMyHome,
  removeApproach,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const sessions = new InMemorySessionsRepo(projects);
  const approaches = new InMemoryApproachesRepo();
  const deps = { groups, projects, sessions, approaches, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  groups.members.push({ groupId: "g1", userId: "manu", role: "member" });
  return { deps, sessions };
}

describe("getMyHome (HU-09)", () => {
  it("lists planned sessions soonest first, undated last, with their approach count", async () => {
    const { deps } = await setup();
    await createSession(deps, { id: "s1", groupId: "g1", userId: "ana" });
    await createSession(deps, { id: "s2", groupId: "g1", userId: "ana", date: "2026-12-10" });
    await createSession(deps, { id: "s3", groupId: "g1", userId: "ana", date: "2026-12-01" });
    await addApproach(deps, { id: "a1", sessionId: "s3", userId: "ana", text: "Uno" });
    await addApproach(deps, { id: "a2", sessionId: "s3", userId: "manu", text: "Dos" });

    const home = await getMyHome(deps, { groupId: "g1", userId: "ana" });
    expect(home.upcoming.map((u) => u.session.id)).toEqual(["s3", "s2", "s1"]);
    expect(home.upcoming.map((u) => u.approachCount)).toEqual([2, 0, 0]);
  });

  it("shows only the approaches I bring, and not the removed ones", async () => {
    const { deps } = await setup();
    await createSession(deps, { id: "s1", groupId: "g1", userId: "ana" });
    await addApproach(deps, { id: "a1", sessionId: "s1", userId: "ana", text: "Mío" });
    await addApproach(deps, { id: "a2", sessionId: "s1", userId: "ana", text: "De Manu", ownerId: "manu" });
    await addApproach(deps, { id: "a3", sessionId: "s1", userId: "ana", text: "Quitado" });
    await removeApproach(deps, { approachId: "a3", userId: "ana" });

    const home = await getMyHome(deps, { groupId: "g1", userId: "ana" });
    expect(home.mine.map((m) => m.approach.text)).toEqual(["Mío"]);
    expect(home.mine[0]?.session.id).toBe("s1");
    const manu = await getMyHome(deps, { groupId: "g1", userId: "manu" });
    expect(manu.mine.map((m) => m.approach.text)).toEqual(["De Manu"]);
  });

  it("moves held sessions out of upcoming and into 'to record'", async () => {
    const { deps, sessions } = await setup();
    await createSession(deps, { id: "s1", groupId: "g1", userId: "ana" });
    await createSession(deps, { id: "s2", groupId: "g1", userId: "ana" });
    await addApproach(deps, { id: "a1", sessionId: "s1", userId: "ana", text: "Mío" });
    sessions.sessions.find((s) => s.id === "s1")!.status = "completed";

    const home = await getMyHome(deps, { groupId: "g1", userId: "ana" });
    expect(home.toRecord.map((s) => s.id)).toEqual(["s1"]);
    expect(home.upcoming.map((u) => u.session.id)).toEqual(["s2"]);
    expect(home.mine).toEqual([]);
  });

  it("is empty for a new group, and closed to outsiders", async () => {
    const { deps } = await setup();
    await expect(getMyHome(deps, { groupId: "g1", userId: "ana" })).resolves.toEqual({
      toRecord: [],
      mine: [],
      upcoming: [],
    });
    await expect(getMyHome(deps, { groupId: "g1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
