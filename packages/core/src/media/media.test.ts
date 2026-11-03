import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InMemoryApproachesRepo,
  InMemoryFileStore,
  InMemoryGroupsRepo,
  InMemoryMediaRepo,
  InMemoryProjectsRepo,
  InMemorySessionsRepo,
  NotFoundError,
  addApproach,
  confirmUpload,
  createGroup,
  createProject,
  createSession,
  getMediaUrl,
  listMedia,
  registerMedia,
  removeMedia,
  type RegisterMediaInput,
} from "../index";

let time = new Date("2026-11-02T10:00:00Z").getTime();
const clock = { now: () => new Date((time += 1000)) };

const photo: RegisterMediaInput = { kind: "photo", mime: "image/jpeg", sizeBytes: 500_000, title: " Parada de cabeza " };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const projects = new InMemoryProjectsRepo();
  const sessions = new InMemorySessionsRepo(projects);
  const approaches = new InMemoryApproachesRepo();
  const media = new InMemoryMediaRepo();
  const files = new InMemoryFileStore();
  const deps = { groups, projects, sessions, approaches, media, files, clock };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin", name: "Conversonantes" });
  groups.members.push({ groupId: "g1", userId: "ana", role: "member" });
  await createProject(deps, { id: "p1", groupId: "g1", userId: "admin", title: "Cristina" });
  await createProject(deps, { id: "p2", groupId: "g1", userId: "admin", title: "Otra" });
  await createSession(deps, { id: "s1", groupId: "g1", userId: "ana", projectId: "p1" });
  await createSession(deps, { id: "s2", groupId: "g1", userId: "ana", projectId: "p2" });
  await createSession(deps, { id: "s-group", groupId: "g1", userId: "ana" });
  await addApproach(deps, { id: "a1", sessionId: "s1", userId: "ana", text: "Calentamiento" });
  const register = (userId: string, id: string, material: RegisterMediaInput, where: object = {}) =>
    registerMedia(deps, { id, projectId: "p1", userId, material, ...where });
  return { deps, files, media, register };
}

describe("registerMedia (HU-13)", () => {
  it("registers a photo as pending and gives the address to upload it; the path follows the bucket layout", async () => {
    const { register, media } = await setup();
    const { media: m, upload } = await register("ana", "m1", photo, { sessionId: "s1" });
    expect(m).toMatchObject({
      kind: "photo",
      title: "Parada de cabeza",
      status: "pending",
      sizeBytes: 500_000,
      path: "grupos/g1/obras/p1/m1.jpg",
      sessionId: "s1",
      createdBy: "ana",
    });
    expect(upload).toMatchObject({ method: "PUT", url: expect.stringContaining("grupos/g1/obras/p1/m1.jpg") });
    expect(upload?.headers["content-type"]).toBe("image/jpeg");
    expect(media.items).toHaveLength(1);
  });

  it("registering the same id again gives back the same material with a fresh upload address", async () => {
    const { register, media } = await setup();
    await register("ana", "m1", photo);
    const again = await register("ana", "m1", photo);
    expect(again.upload).toBeDefined();
    expect(media.items).toHaveLength(1);
    // Someone else cannot take over an id.
    await expect(register("admin", "m1", photo)).rejects.toBeInstanceOf(ConflictError);
    expect(media.items[0]!.createdBy).toBe("ana");
  });

  it("links and notes need no upload and are ready at once; an approach brings its session along", async () => {
    const { register } = await setup();
    const link = await register("ana", "l1", { kind: "link", url: " https://youtu.be/abc " }, { approachId: "a1" });
    expect(link.upload).toBeUndefined();
    expect(link.media).toMatchObject({ kind: "link", status: "uploaded", url: "https://youtu.be/abc", approachId: "a1", sessionId: "s1" });
    const note = await register("ana", "n1", { kind: "note", body: "  Salió bien el saludo  " });
    expect(note.media).toMatchObject({ kind: "note", status: "uploaded", body: "Salió bien el saludo" });
    expect(note.media.sessionId).toBeUndefined(); // unassigned material of the obra
  });

  it("validates sizes, types, duration, links and notes", async () => {
    const { register } = await setup();
    const bad = (m: object) => register("ana", `x-${Math.random()}`, m as RegisterMediaInput);
    await expect(bad({ ...photo, sizeBytes: 11 * 1024 * 1024 })).rejects.toThrow(/pesa demasiado/);
    await expect(bad({ ...photo, mime: "application/pdf" })).rejects.toThrow(/tipo de archivo/);
    await expect(bad({ kind: "audio", mime: "audio/webm;codecs=opus", sizeBytes: 100, durationSeconds: 181 })).rejects.toThrow(/3 minutos/);
    await expect(bad({ kind: "document", mime: "application/pdf", sizeBytes: 21 * 1024 * 1024 })).rejects.toThrow();
    await expect(bad({ kind: "link", url: "javascript:alert(1)" })).rejects.toThrow(/https/);
    await expect(bad({ kind: "note", body: "   " })).rejects.toThrow();
    await expect(bad({ kind: "video", mime: "video/mp4", sizeBytes: 1 })).rejects.toThrow();
    const audio = await register("ana", "a-ok", { kind: "audio", mime: "audio/webm;codecs=opus", sizeBytes: 900_000, durationSeconds: 134 });
    expect(audio.media).toMatchObject({ mime: "audio/webm", durationSeconds: 134, path: "grupos/g1/obras/p1/a-ok.webm" });
  });

  it("only members of the group, only for an obra of it, and only with session/approach of that obra", async () => {
    const { register, deps } = await setup();
    await expect(register("stranger", "m1", photo)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      registerMedia(deps, { id: "m2", projectId: "missing", userId: "ana", material: photo }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(register("ana", "m3", photo, { sessionId: "s2" })).rejects.toBeInstanceOf(NotFoundError); // other obra
    await expect(register("ana", "m4", photo, { sessionId: "s-group" })).rejects.toBeInstanceOf(NotFoundError); // no obra
    await expect(register("ana", "m5", photo, { approachId: "missing" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(register("ana", "m6", photo, { sessionId: "s2", approachId: "a1" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("confirmUpload", () => {
  it("checks the file is in the store at the promised size, then marks it uploaded", async () => {
    const { register, files, deps } = await setup();
    const { media } = await register("ana", "m1", photo);
    await expect(confirmUpload(deps, { mediaId: "m1", userId: "ana" })).rejects.toBeInstanceOf(ConflictError); // not there yet

    files.put(media.path!, 123); // wrong size
    await expect(confirmUpload(deps, { mediaId: "m1", userId: "ana" })).rejects.toBeInstanceOf(ConflictError);
    expect(files.deleted).toEqual([media.path]); // the incomplete object is discarded

    files.put(media.path!, 500_000);
    expect((await confirmUpload(deps, { mediaId: "m1", userId: "ana" })).status).toBe("uploaded");
    expect((await confirmUpload(deps, { mediaId: "m1", userId: "ana" })).status).toBe("uploaded"); // idempotent
  });

  it("only the author confirms, and others do not even see a pending file", async () => {
    const { register, files, deps } = await setup();
    const { media } = await register("ana", "m1", photo);
    files.put(media.path!, 500_000);
    await expect(confirmUpload(deps, { mediaId: "m1", userId: "admin" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmUpload(deps, { mediaId: "m1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listMedia, getMediaUrl, removeMedia", () => {
  async function withMaterial() {
    const s = await setup();
    const uploaded = async (userId: string, id: string, where: object = {}) => {
      const { media } = await s.register(userId, id, photo, where);
      s.files.put(media.path!, 500_000);
      await confirmUpload(s.deps, { mediaId: id, userId });
    };
    await uploaded("ana", "m-obra");
    await uploaded("ana", "m-session", { sessionId: "s1" });
    await uploaded("admin", "m-approach", { approachId: "a1" });
    await s.register("ana", "m-pending", photo, { sessionId: "s1" });
    await s.register("ana", "n-1", { kind: "note", body: "Una nota" }, { sessionId: "s1" });
    return s;
  }

  it("lists by obra, session or approach, newest first; pending uploads show only to their author", async () => {
    const { deps } = await withMaterial();
    const ids = async (userId: string, filter: object = {}) =>
      (await listMedia(deps, { projectId: "p1", userId, ...filter })).map((m) => m.id);
    expect(await ids("admin")).toEqual(["n-1", "m-approach", "m-session", "m-obra"]);
    expect(await ids("ana")).toEqual(["n-1", "m-pending", "m-approach", "m-session", "m-obra"]);
    expect(await ids("admin", { sessionId: "s1" })).toEqual(["n-1", "m-approach", "m-session"]);
    expect(await ids("admin", { approachId: "a1" })).toEqual(["m-approach"]);
    await expect(listMedia(deps, { projectId: "p1", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("signs a short-lived read for files, returns the link itself, and refuses a file still uploading", async () => {
    const { deps, register } = await withMaterial();
    const file = await getMediaUrl(deps, { mediaId: "m-session", userId: "admin" });
    expect(file.url).toContain("grupos/g1/obras/p1/m-session.jpg");
    expect(file.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    await register("ana", "l1", { kind: "link", url: "https://youtu.be/abc" });
    expect(await getMediaUrl(deps, { mediaId: "l1", userId: "admin" })).toEqual({ url: "https://youtu.be/abc" });
    await expect(getMediaUrl(deps, { mediaId: "m-pending", userId: "ana" })).rejects.toBeInstanceOf(ConflictError);
    await expect(getMediaUrl(deps, { mediaId: "n-1", userId: "ana" })).rejects.toBeInstanceOf(ConflictError); // a note has nothing to open
    await expect(getMediaUrl(deps, { mediaId: "m-session", userId: "stranger" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the author or an admin removes it; others cannot", async () => {
    const { deps } = await withMaterial();
    await expect(removeMedia(deps, { mediaId: "m-approach", userId: "ana" })).rejects.toBeInstanceOf(ForbiddenError);
    await removeMedia(deps, { mediaId: "m-session", userId: "ana" }); // her own
    await removeMedia(deps, { mediaId: "m-approach", userId: "admin" }); // admin, someone else's
    expect((await listMedia(deps, { projectId: "p1", userId: "admin" })).map((m) => m.id)).toEqual(["n-1", "m-obra"]);
    await expect(removeMedia(deps, { mediaId: "m-session", userId: "ana" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
