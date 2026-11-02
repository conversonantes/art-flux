import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InMemoryGroupsRepo,
  InMemoryProjectsRepo,
  NotFoundError,
  SlugTakenError,
  createGroup,
  createProject,
  getProject,
  listProjects,
  listTeam,
  normalizeThemes,
  removeFromTeam,
  setTeamRoles,
  updateProject,
  type Project,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const deps = { groups, projects, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  groups.members.push({ groupId: "g1", userId: "luis", role: "member" });
  return {
    groups,
    projects,
    deps,
    make: (id: string, title: string, extra: object = {}) =>
      createProject(deps, { id, groupId: "g1", userId: "admin", title, ...extra }),
  };
}

describe("createProject (HU-05)", () => {
  it("creates a project with defaults and a slug from the title", async () => {
    const { make } = await setup();
    const p = await make("p1", "  Cristina ");
    expect(p).toMatchObject({
      groupId: "g1",
      slug: "cristina",
      title: "Cristina",
      status: "searching",
      themes: [],
    });
    expect(p.visibilityAgreement).toBeUndefined();
  });

  it("accepts status, themes and the visibility agreement", async () => {
    const { make } = await setup();
    const p = await make("p1", "Cristina", {
      status: "staging",
      themes: ["#Memoria", " duelo ", "memoria", ""],
      visibilityAgreement: "Podemos mostrar fotos, no audios.",
    });
    expect(p.status).toBe("staging");
    expect(p.themes).toEqual(["memoria", "duelo"]);
    expect(p.visibilityAgreement).toBe("Podemos mostrar fotos, no audios.");
  });

  it("requires a title and a valid status", async () => {
    const { make } = await setup();
    await expect(make("p1", "   ")).rejects.toThrow();
    await expect(make("p1", "X", { status: "volando" })).rejects.toThrow();
  });

  it("limits themes to 8", async () => {
    const { make } = await setup();
    const many = Array.from({ length: 9 }, (_, i) => `tema${i}`);
    await expect(make("p1", "X", { themes: many })).rejects.toThrow();
  });

  it("allows the same title in different groups and repeated titles with a numeric slug", async () => {
    const { make } = await setup();
    const a = await make("p1", "Cristina");
    const b = await make("p2", "Cristina");
    expect([a.slug, b.slug]).toEqual(["cristina", "cristina-2"]);
  });

  it("does not use reserved words as slug", async () => {
    const { make } = await setup();
    expect((await make("p1", "Equipo")).slug).toBe("equipo-2");
  });

  it("retries when someone takes the slug in between", async () => {
    const { projects, make } = await setup();
    const original = projects.create.bind(projects);
    let first = true;
    projects.create = async (p: Project) => {
      if (first) {
        first = false;
        throw new SlugTakenError(p.slug);
      }
      return original(p);
    };
    expect((await make("p1", "Carrera")).slug).toBe("carrera-2");
  });

  it("is admin-only; outsiders do not even learn the group exists", async () => {
    const { deps } = await setup();
    await expect(
      createProject(deps, { id: "p", groupId: "g1", userId: "ana", title: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createProject(deps, { id: "p", groupId: "g1", userId: "stranger", title: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateProject (HU-05)", () => {
  it("edits everything later but keeps the slug", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina", { visibilityAgreement: "viejo" });
    const updated = await updateProject(deps, {
      projectId: p.id,
      userId: "admin",
      changes: { title: "Cristina (versión 2)", status: "running", themes: ["#Duelo"], visibilityAgreement: "nuevo" },
    });
    expect(updated).toMatchObject({
      slug: "cristina",
      title: "Cristina (versión 2)",
      status: "running",
      themes: ["duelo"],
      visibilityAgreement: "nuevo",
    });
  });

  it("only changes the fields it is given, and an empty agreement clears it", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina", { status: "staging", visibilityAgreement: "algo" });
    const same = await updateProject(deps, { projectId: p.id, userId: "admin", changes: { themes: ["a b"] } });
    expect(same).toMatchObject({ status: "staging", title: "Cristina", themes: ["a b"] });
    const cleared = await updateProject(deps, {
      projectId: p.id,
      userId: "admin",
      changes: { visibilityAgreement: "  " },
    });
    expect(cleared.visibilityAgreement).toBeUndefined();
  });

  it("rejects an empty title and non-admins", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina");
    await expect(
      updateProject(deps, { projectId: p.id, userId: "admin", changes: { title: " " } }),
    ).rejects.toThrow();
    await expect(
      updateProject(deps, { projectId: p.id, userId: "ana", changes: { title: "Otro" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateProject(deps, { projectId: "missing", userId: "admin", changes: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reading projects", () => {
  it("members see the list (newest first) and each project by slug; outsiders see nothing", async () => {
    const { deps, make } = await setup();
    await make("p1", "Primera");
    await make("p2", "Segunda");
    const list = await listProjects(deps, { groupId: "g1", userId: "ana" });
    expect(list.map((p) => p.slug)).toEqual(["segunda", "primera"]);
    expect((await getProject(deps, { groupId: "g1", slug: "primera", userId: "ana" })).title).toBe("Primera");
    await expect(getProject(deps, { groupId: "g1", slug: "nada", userId: "ana" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(listProjects(deps, { groupId: "g1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("team (HU-06)", () => {
  it("adds group members with several roles each", async () => {
    const { deps, projects, make } = await setup();
    projects.displayNames.set("admin", "Santi");
    const p = await make("p1", "Cristina");
    await setTeamRoles(deps, { projectId: p.id, userId: "admin", memberId: "admin", roles: ["Owner", "director"] });
    await setTeamRoles(deps, { projectId: p.id, userId: "admin", memberId: "ana", roles: ["actor"] });

    expect(await listTeam(deps, { projectId: p.id, userId: "luis" })).toEqual([
      { userId: "admin", roles: ["owner", "director"], displayName: "Santi" },
      { userId: "ana", roles: ["actor"] },
    ]);
  });

  it("replaces roles, dedupes them and caps them at 6", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina");
    const set = (roles: string[]) =>
      setTeamRoles(deps, { projectId: p.id, userId: "admin", memberId: "ana", roles });
    await set(["actor", "actor", " Técnico "]).catch(() => undefined);
    await set(["actor", "actor", "technician"]);
    expect((await listTeam(deps, { projectId: p.id, userId: "admin" }))[0]?.roles).toEqual(["actor", "technician"]);
    await expect(set(["a", "b", "c", "d", "e", "f", "g"])).rejects.toThrow();
    await expect(set(["con espacios y ñ"])).rejects.toThrow();
  });

  it("only lets admins edit the team, and only with people from the group", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina");
    await expect(
      setTeamRoles(deps, { projectId: p.id, userId: "ana", memberId: "luis", roles: ["actor"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setTeamRoles(deps, { projectId: p.id, userId: "admin", memberId: "stranger", roles: ["actor"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("removes someone from the team without touching their group membership", async () => {
    const { deps, groups, make } = await setup();
    const p = await make("p1", "Cristina");
    await setTeamRoles(deps, { projectId: p.id, userId: "admin", memberId: "ana", roles: ["actor"] });
    await removeFromTeam(deps, { projectId: p.id, userId: "admin", memberId: "ana" });
    await removeFromTeam(deps, { projectId: p.id, userId: "admin", memberId: "ana" }); // idempotent
    expect(await listTeam(deps, { projectId: p.id, userId: "admin" })).toEqual([]);
    expect(await groups.getMemberRole("g1", "ana")).toBe("member");
  });

  it("hides the team from outsiders", async () => {
    const { deps, make } = await setup();
    const p = await make("p1", "Cristina");
    await expect(listTeam(deps, { projectId: p.id, userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listTeam(deps, { projectId: "missing", userId: "admin" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("normalizeThemes", () => {
  it("strips hashes, lowercases, collapses spaces and dedupes", () => {
    expect(normalizeThemes(["#Memoria", "  ##  Duelo   Familiar ", "memoria", "#", ""])).toEqual([
      "memoria",
      "duelo familiar",
    ]);
  });
});
