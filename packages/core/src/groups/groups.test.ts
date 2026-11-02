import { describe, expect, it } from "vitest";
import {
  HandleTakenError,
  InMemoryGroupsRepo,
  createGroup,
  handleBase,
  handleCandidate,
  handleSchema,
  resolveInitialGroup,
  type Group,
  type Member,
} from "./index";

const clock = { now: () => new Date("2026-11-02T10:00:00Z") };
const setup = () => {
  const groups = new InMemoryGroupsRepo();
  return { groups, deps: { groups, clock } };
};

describe("createGroup", () => {
  it("leaves the creator as admin", async () => {
    const { groups, deps } = setup();
    const g = await createGroup(deps, { id: "g1", userId: "u1", name: "Conversonantes" });
    expect(groups.members).toEqual([{ groupId: "g1", userId: "u1", role: "admin" }]);
    expect(g.createdAt).toEqual(clock.now());
  });

  it("requires a name; city is optional", async () => {
    const { deps } = setup();
    await expect(createGroup(deps, { id: "g1", userId: "u1", name: "   " })).rejects.toThrow();
    const g = await createGroup(deps, { id: "g2", userId: "u1", name: "Sin ciudad", city: " " });
    expect(g.city).toBeUndefined();
    const h = await createGroup(deps, { id: "g3", userId: "u1", name: "Con ciudad", city: " Medellín " });
    expect(h.city).toBe("Medellín");
  });

  it("generates the @handle from the name", async () => {
    const { deps } = setup();
    const g = await createGroup(deps, { id: "g1", userId: "u1", name: "  Conversonantes Teatro " });
    expect(g.handle).toBe("conversonantes-teatro");
  });

  it("allows repeated names with different @handles", async () => {
    const { deps } = setup();
    const a = await createGroup(deps, { id: "g1", userId: "u1", name: "Conversonantes" });
    const b = await createGroup(deps, { id: "g2", userId: "u2", name: "Conversonantes" });
    const c = await createGroup(deps, { id: "g3", userId: "u3", name: "conversonantes" });
    expect([a.handle, b.handle, c.handle]).toEqual([
      "conversonantes",
      "conversonantes-2",
      "conversonantes-3",
    ]);
    expect(b.name).toBe(a.name);
  });

  it("retries if someone takes the handle between check and save", async () => {
    const { groups, deps } = setup();
    const originalCreate = groups.create.bind(groups);
    let first = true;
    groups.create = async (g: Group, m: Member) => {
      if (first) {
        first = false;
        throw new HandleTakenError(g.handle);
      }
      return originalCreate(g, m);
    };
    const g = await createGroup(deps, { id: "g1", userId: "u1", name: "Carrera" });
    expect(g.handle).toBe("carrera-2");
  });

  it("does not use reserved handles", async () => {
    const { deps } = setup();
    const g = await createGroup(deps, { id: "g1", userId: "u1", name: "Admin" });
    expect(g.handle).toBe("admin-2");
  });
});

describe("@handle", () => {
  it("normalizes accents, symbols and spaces", () => {
    expect(handleBase("Compañía Ñandú & Co.")).toBe("compania-nandu-co");
  });
  it("falls back to group when nothing useful remains", () => {
    expect(handleBase("¡¡!!")).toBe("group");
    expect(handleBase("ab")).toBe("group");
  });
  it("respects the max length when adding a suffix", () => {
    const base = handleBase("a".repeat(60));
    expect(handleCandidate(base, 12).length).toBeLessThanOrEqual(30);
  });
  it("validates the format so it can be customized later", () => {
    expect(handleSchema.safeParse("mi-grupo").success).toBe(true);
    expect(handleSchema.safeParse("Mi Grupo").success).toBe(false);
    expect(handleSchema.safeParse("-mi").success).toBe(false);
    expect(handleSchema.safeParse("api").success).toBe(false);
  });
});

describe("resolveInitialGroup", () => {
  it("no group: offers create or explore", async () => {
    const { deps } = setup();
    expect(await resolveInitialGroup(deps, "u1")).toEqual({ destination: "none" });
  });

  it("one group: goes straight to it", async () => {
    const { deps } = setup();
    const g = await createGroup(deps, { id: "g1", userId: "u1", name: "Uno" });
    expect(await resolveInitialGroup(deps, "u1")).toEqual({ destination: "group", group: g });
  });

  it("several: offers choosing, or goes to the remembered one", async () => {
    const { deps } = setup();
    await createGroup(deps, { id: "g1", userId: "u1", name: "Uno" });
    const g2 = await createGroup(deps, { id: "g2", userId: "u1", name: "Dos" });
    const r = await resolveInitialGroup(deps, "u1");
    expect(r.destination).toBe("choose");
    expect(await resolveInitialGroup(deps, "u1", "g2")).toEqual({ destination: "group", group: g2 });
    expect((await resolveInitialGroup(deps, "u1", "missing")).destination).toBe("choose");
  });
});
