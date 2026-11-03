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
  listApproaches,
  removeApproach,
  setApproachNote,
  reorderApproaches,
  updateApproach,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const sessions = new InMemorySessionsRepo(projects);
  const approaches = new InMemoryApproachesRepo();
  const findings = new InMemoryFindingsRepo();
  const deps = { groups, projects, sessions, approaches, findings, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  groups.members.push({ groupId: "g1", userId: "manu", role: "member" });
  const session = await createSession(deps, { id: "s1", groupId: "g1", userId: "ana", objective: "Analizar" });
  let n = 0;
  return {
    groups,
    sessions,
    approaches,
    deps,
    session,
    add: (userId: string, text: string, ownerId?: string) =>
      addApproach(deps, { id: `a${++n}`, sessionId: "s1", userId, text, ownerId }),
    texts: async () => (await listApproaches(deps, { sessionId: "s1", userId: "ana" })).map((a) => a.text),
  };
}

describe("addApproach (HU-08)", () => {
  it("adds approaches in order; the owner defaults to the author", async () => {
    const { add } = await setup();
    const a = await add("ana", "  Calentamiento corporal ");
    const b = await add("ana", "Improvisación", "manu");
    expect(a).toMatchObject({ text: "Calentamiento corporal", ownerId: "ana", position: 1, createdBy: "ana" });
    expect(b).toMatchObject({ ownerId: "manu", position: 2 });
  });

  it("any member can add, outsiders cannot, and the text is required", async () => {
    const { add, deps } = await setup();
    await expect(add("manu", "Algo")).resolves.toBeDefined();
    await expect(add("stranger", "Algo")).rejects.toBeInstanceOf(NotFoundError);
    await expect(add("ana", "   ")).rejects.toThrow();
    await expect(add("ana", "x".repeat(501))).rejects.toThrow();
    await expect(
      addApproach(deps, { id: "z", sessionId: "missing", userId: "ana", text: "Algo" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only someone from the group can be the owner", async () => {
    const { add } = await setup();
    await expect(add("ana", "Algo", "stranger")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not allow changes once the session was held", async () => {
    const { add, sessions } = await setup();
    sessions.sessions[0]!.status = "completed";
    await expect(add("ana", "Tarde")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("updateApproach / removeApproach", () => {
  it("edits the text and who brings it", async () => {
    const { add, deps } = await setup();
    const a = await add("ana", "Original");
    const updated = await updateApproach(deps, {
      approachId: a.id,
      userId: "manu",
      changes: { text: " Corregido ", ownerId: "manu" },
    });
    expect(updated).toMatchObject({ text: "Corregido", ownerId: "manu" });
    const onlyOwner = await updateApproach(deps, { approachId: a.id, userId: "ana", changes: { ownerId: "ana" } });
    expect(onlyOwner).toMatchObject({ text: "Corregido", ownerId: "ana" });
  });

  it("rejects an empty text, an outside owner and outsiders", async () => {
    const { add, deps } = await setup();
    const a = await add("ana", "Algo");
    await expect(
      updateApproach(deps, { approachId: a.id, userId: "ana", changes: { text: "  " } }),
    ).rejects.toThrow();
    await expect(
      updateApproach(deps, { approachId: a.id, userId: "ana", changes: { ownerId: "stranger" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateApproach(deps, { approachId: a.id, userId: "stranger", changes: { text: "x" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateApproach(deps, { approachId: "missing", userId: "ana", changes: { text: "x" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes one without disturbing the others, and keeps counting after it", async () => {
    const { add, deps, texts } = await setup();
    await add("ana", "Uno");
    const dos = await add("ana", "Dos");
    await add("ana", "Tres");
    await removeApproach(deps, { approachId: dos.id, userId: "manu" });
    expect(await texts()).toEqual(["Uno", "Tres"]);
    expect((await add("ana", "Cuatro")).position).toBe(4);
    await expect(removeApproach(deps, { approachId: dos.id, userId: "ana" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reorderApproaches (HU-08)", () => {
  it("applies the new order and returns the list", async () => {
    const { add, deps, texts } = await setup();
    const a = await add("ana", "Calentamiento");
    const b = await add("ana", "Improvisación");
    const c = await add("ana", "Análisis");
    const list = await reorderApproaches(deps, { sessionId: "s1", userId: "manu", orderedIds: [c.id, a.id, b.id] });
    expect(list.map((x) => x.text)).toEqual(["Análisis", "Calentamiento", "Improvisación"]);
    expect(await texts()).toEqual(["Análisis", "Calentamiento", "Improvisación"]);
  });

  it("later additions go to the end of a reordered list", async () => {
    const { add, deps, texts } = await setup();
    const a = await add("ana", "A");
    const b = await add("ana", "B");
    await reorderApproaches(deps, { sessionId: "s1", userId: "ana", orderedIds: [b.id, a.id] });
    await add("ana", "C");
    expect(await texts()).toEqual(["B", "A", "C"]);
  });

  it("refuses an order that does not match the current list (someone added or removed meanwhile)", async () => {
    const { add, deps } = await setup();
    const a = await add("ana", "A");
    const b = await add("ana", "B");
    const order = (orderedIds: string[]) => reorderApproaches(deps, { sessionId: "s1", userId: "ana", orderedIds });
    await expect(order([a.id])).rejects.toBeInstanceOf(ConflictError); // missing one
    await expect(order([a.id, b.id, "extra"])).rejects.toBeInstanceOf(ConflictError); // unknown one
    await expect(order([a.id, a.id])).rejects.toBeInstanceOf(ConflictError); // repeated
  });

  it("is for members of a planned session only", async () => {
    const { add, deps, sessions } = await setup();
    const a = await add("ana", "A");
    await expect(
      reorderApproaches(deps, { sessionId: "s1", userId: "stranger", orderedIds: [a.id] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    sessions.sessions[0]!.status = "completed";
    await expect(
      reorderApproaches(deps, { sessionId: "s1", userId: "ana", orderedIds: [a.id] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("listApproaches", () => {
  it("is visible to members only, even after the session was held", async () => {
    const { add, deps, sessions } = await setup();
    await add("ana", "Uno");
    sessions.sessions[0]!.status = "completed";
    expect(await listApproaches(deps, { sessionId: "s1", userId: "manu" })).toHaveLength(1);
    await expect(listApproaches(deps, { sessionId: "s1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("setApproachNote (cómo lo planteo)", () => {
  it("the owner writes the note and everyone in the group reads it", async () => {
    const { add, deps, texts } = await setup();
    const a = await add("ana", "Calentamiento", "manu");
    const saved = await setApproachNote(deps, { approachId: a.id, userId: "manu", note: "  Saludo al sol y juegos  " });
    expect(saved.note).toBe("Saludo al sol y juegos");
    const seen = await listApproaches(deps, { sessionId: "s1", userId: "admin" });
    expect(seen[0]?.note).toBe("Saludo al sol y juegos");
    expect(await texts()).toEqual(["Calentamiento"]); // the text itself is untouched
  });

  it("empty or null clears it", async () => {
    const { add, deps } = await setup();
    const a = await add("ana", "Calentamiento");
    await setApproachNote(deps, { approachId: a.id, userId: "ana", note: "Algo" });
    expect((await setApproachNote(deps, { approachId: a.id, userId: "ana", note: "   " })).note).toBeUndefined();
    await setApproachNote(deps, { approachId: a.id, userId: "ana", note: "Otra vez" });
    expect((await setApproachNote(deps, { approachId: a.id, userId: "ana", note: null })).note).toBeUndefined();
  });

  it("only the owner writes: not the author who assigned it, nor the admin; outsiders see nothing", async () => {
    const { add, deps } = await setup();
    const a = await add("ana", "Calentamiento", "manu");
    await expect(setApproachNote(deps, { approachId: a.id, userId: "ana", note: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setApproachNote(deps, { approachId: a.id, userId: "admin", note: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setApproachNote(deps, { approachId: a.id, userId: "stranger", note: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setApproachNote(deps, { approachId: "missing", userId: "ana", note: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is too long above 2000 characters, and frozen once the session was held; reassigning moves the right to write", async () => {
    const { add, deps, sessions } = await setup();
    const a = await add("ana", "Calentamiento");
    await expect(setApproachNote(deps, { approachId: a.id, userId: "ana", note: "x".repeat(2001) })).rejects.toThrow();

    await setApproachNote(deps, { approachId: a.id, userId: "ana", note: "Mi plan" });
    await updateApproach(deps, { approachId: a.id, userId: "ana", changes: { ownerId: "manu" } });
    await expect(setApproachNote(deps, { approachId: a.id, userId: "ana", note: "y" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await setApproachNote(deps, { approachId: a.id, userId: "manu", note: "El de Manu" })).note).toBe("El de Manu");

    sessions.sessions[0]!.status = "completed";
    await expect(setApproachNote(deps, { approachId: a.id, userId: "manu", note: "z" })).rejects.toBeInstanceOf(ConflictError);
  });
});
