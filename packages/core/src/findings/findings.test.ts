import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InMemoryApproachesRepo,
  InMemoryFindingsRepo,
  InMemoryGroupsRepo,
  InMemoryProjectsRepo,
  InMemorySessionsRepo,
  NotFoundError,
  addApproach,
  createGroup,
  createSession,
  listFragments,
  removeFragment,
  saveFragment,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

async function setup(held = true) {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const sessions = new InMemorySessionsRepo(projects);
  const approaches = new InMemoryApproachesRepo();
  const findings = new InMemoryFindingsRepo();
  const deps = { groups, projects, sessions, approaches, findings, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  groups.members.push({ groupId: "g1", userId: "manu", role: "member" });
  await createSession(deps, { id: "s1", groupId: "g1", userId: "ana" });
  await addApproach(deps, { id: "a1", sessionId: "s1", userId: "ana", text: "Análisis", ownerId: "ana" });
  if (held) sessions.sessions[0]!.status = "completed";
  const save = (userId: string, id: string, text: string, kind = "found", approachId = "a1") =>
    saveFragment(deps, { id, approachId, userId, kind, text });
  return { deps, sessions, findings, save };
}

describe("saveFragment (HU-12)", () => {
  it("any member adds fragments; each keeps its author and kind", async () => {
    const { deps, save } = await setup();
    const a = await save("ana", "f1", "  Acciones claras  ");
    await save("manu", "f2", "Armamos un timeline");
    await save("admin", "f3", "Faltó el étude", "missing");
    expect(a).toMatchObject({ authorId: "ana", kind: "found", text: "Acciones claras" });

    const list = await listFragments(deps, { approachId: "a1", userId: "manu" });
    expect(list.map((f) => [f.authorId, f.kind])).toEqual([["ana", "found"], ["manu", "found"], ["admin", "missing"]]);
  });

  it("saving the same id again edits its text (autosave) and does not duplicate", async () => {
    const { deps, save } = await setup();
    await save("ana", "f1", "Primero");
    const again = await save("ana", "f1", "Primero, y más");
    expect(again.text).toBe("Primero, y más");
    expect(again.updatedAt.getTime()).toBeGreaterThan(again.createdAt.getTime());
    expect(await listFragments(deps, { approachId: "a1", userId: "ana" })).toHaveLength(1);
  });

  it("only the author edits a fragment, and its kind does not change", async () => {
    const { save } = await setup();
    await save("ana", "f1", "Mío");
    await expect(save("manu", "f1", "Pisado")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(save("ana", "f1", "Mío", "missing")).rejects.toBeInstanceOf(ConflictError);
  });

  it("only opens once the session was held", async () => {
    const { save } = await setup(false);
    await expect(save("ana", "f1", "Antes de tiempo")).rejects.toBeInstanceOf(ConflictError);
  });

  it("validates the text and the kind, and hides the approach from outsiders", async () => {
    const { save } = await setup();
    await expect(save("ana", "f1", "   ")).rejects.toThrow();
    await expect(save("ana", "f1", "x".repeat(4001))).rejects.toThrow();
    await expect(save("ana", "f1", "Algo", "otro")).rejects.toThrow();
    await expect(save("stranger", "f1", "Algo")).rejects.toBeInstanceOf(NotFoundError);
    await expect(save("ana", "f1", "Algo", "found", "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an id cannot be reused on another approach", async () => {
    const { deps, save } = await setup();
    await addApproach(deps, { id: "a2", sessionId: "s1", userId: "ana", text: "Otro" }).catch(() => undefined); // frozen: held
    await save("ana", "f1", "Uno");
    await expect(save("ana", "f1", "Dos", "found", "a2")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removeFragment (HU-12)", () => {
  it("the author removes their own fragment; the others stay", async () => {
    const { deps, save } = await setup();
    await save("ana", "f1", "Mío");
    await save("manu", "f2", "De Manu");
    await removeFragment(deps, { fragmentId: "f1", userId: "ana" });
    expect((await listFragments(deps, { approachId: "a1", userId: "ana" })).map((f) => f.id)).toEqual(["f2"]);
    await expect(removeFragment(deps, { fragmentId: "f1", userId: "ana" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nobody else removes it, not even the admin; outsiders see nothing", async () => {
    const { deps, save } = await setup();
    await save("ana", "f1", "Mío");
    await expect(removeFragment(deps, { fragmentId: "f1", userId: "admin" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeFragment(deps, { fragmentId: "f1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listFragments(deps, { approachId: "a1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
