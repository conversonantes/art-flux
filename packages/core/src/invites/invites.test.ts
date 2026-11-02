import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InMemoryGroupsRepo,
  InMemoryInvitesRepo,
  InviteEmailMismatchError,
  InviteInvalidError,
  acceptInvite,
  createGroup,
  createInvite,
  listInvites,
  randomTokenGenerator,
  revokeInvite,
} from "../index";

const clock = { now: () => new Date("2026-11-02T10:00:00Z") };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const invites = new InMemoryInvitesRepo(groups);
  let n = 0;
  const tokens = { next: () => `token-${++n}` };
  const deps = { groups, invites, clock, tokens };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin1", name: "Conversonantes" });
  return { groups, invites, deps };
}

const invite = (deps: Awaited<ReturnType<typeof setup>>["deps"], id: string, email = "ana@correo.com") =>
  createInvite(deps, { id, groupId: "g1", userId: "admin1", email });

describe("createInvite", () => {
  it("lets an admin invite an email, normalized", async () => {
    const { deps } = await setup();
    const inv = await invite(deps, "i1", "  Ana@Correo.COM ");
    expect(inv.email).toBe("ana@correo.com");
    expect(inv.token).toBe("token-1");
  });

  it("rejects invalid emails", async () => {
    const { deps } = await setup();
    await expect(invite(deps, "i1", "no-es-correo")).rejects.toThrow();
  });

  it("rejects non-admins and outsiders", async () => {
    const { deps } = await setup();
    const inv = await invite(deps, "i1");
    await acceptInvite(deps, { token: inv.token, userId: "ana", userEmail: "ana@correo.com" });
    for (const userId of ["ana", "stranger"]) {
      await expect(
        createInvite(deps, { id: "x", groupId: "g1", userId, email: "otro@correo.com" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("keeps one live link per email: re-inviting revokes the old one", async () => {
    const { deps } = await setup();
    const a = await invite(deps, "i1");
    const b = await invite(deps, "i2", "ANA@correo.com");
    const args = { userId: "ana", userEmail: "ana@correo.com" };
    await expect(acceptInvite(deps, { token: a.token, ...args })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
    await expect(acceptInvite(deps, { token: b.token, ...args })).resolves.toMatchObject({ id: "g1" });
  });

  it("allows several live invitations for different emails", async () => {
    const { deps } = await setup();
    const ana = await invite(deps, "i1", "ana@correo.com");
    const luis = await invite(deps, "i2", "luis@correo.com");
    await expect(
      acceptInvite(deps, { token: ana.token, userId: "ana", userEmail: "ana@correo.com" }),
    ).resolves.toBeDefined();
    await expect(
      acceptInvite(deps, { token: luis.token, userId: "luis", userEmail: "luis@correo.com" }),
    ).resolves.toBeDefined();
  });
});

describe("acceptInvite", () => {
  it("makes the invited person a member", async () => {
    const { deps, groups } = await setup();
    const { token } = await invite(deps, "i1");
    const group = await acceptInvite(deps, { token, userId: "ana", userEmail: "Ana@Correo.com" });
    expect(group.id).toBe("g1");
    expect(await groups.getMemberRole("g1", "ana")).toBe("member");
  });

  it("refuses a different email even with the right token", async () => {
    const { deps, groups } = await setup();
    const { token } = await invite(deps, "i1");
    await expect(
      acceptInvite(deps, { token, userId: "intruder", userEmail: "intruso@correo.com" }),
    ).rejects.toBeInstanceOf(InviteEmailMismatchError);
    expect(await groups.getMemberRole("g1", "intruder")).toBeNull();
  });

  it("is idempotent and never downgrades an admin", async () => {
    const { deps, groups } = await setup();
    const { token } = await invite(deps, "i1", "admin@correo.com");
    await acceptInvite(deps, { token, userId: "admin1", userEmail: "admin@correo.com" });
    expect(await groups.getMemberRole("g1", "admin1")).toBe("admin");
    const ana = await invite(deps, "i2");
    const args = { token: ana.token, userId: "ana", userEmail: "ana@correo.com" };
    await acceptInvite(deps, args);
    await acceptInvite(deps, args);
    expect(groups.members.filter((m) => m.userId === "ana")).toHaveLength(1);
  });

  it("rejects unknown tokens", async () => {
    const { deps } = await setup();
    await expect(
      acceptInvite(deps, { token: "nope", userId: "u", userEmail: "ana@correo.com" }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
  });
});

describe("revokeInvite / listInvites", () => {
  it("cancels one invitation and keeps the others", async () => {
    const { deps } = await setup();
    const ana = await invite(deps, "i1", "ana@correo.com");
    const luis = await invite(deps, "i2", "luis@correo.com");
    await revokeInvite(deps, { inviteId: ana.id, userId: "admin1" });
    await expect(
      acceptInvite(deps, { token: ana.token, userId: "ana", userEmail: "ana@correo.com" }),
    ).rejects.toBeInstanceOf(InviteInvalidError);
    await expect(
      acceptInvite(deps, { token: luis.token, userId: "luis", userEmail: "luis@correo.com" }),
    ).resolves.toBeDefined();
  });

  it("keeps people who already joined", async () => {
    const { deps, groups } = await setup();
    const inv = await invite(deps, "i1");
    await acceptInvite(deps, { token: inv.token, userId: "ana", userEmail: "ana@correo.com" });
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
    expect(await groups.getMemberRole("g1", "ana")).toBe("member");
  });

  it("is admin-only and idempotent", async () => {
    const { deps } = await setup();
    const inv = await invite(deps, "i1");
    await expect(
      revokeInvite(deps, { inviteId: inv.id, userId: "stranger" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      revokeInvite(deps, { inviteId: "missing", userId: "admin1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
  });

  it("lists only live invitations, to admins", async () => {
    const { deps } = await setup();
    const ana = await invite(deps, "i1", "ana@correo.com");
    await invite(deps, "i2", "luis@correo.com");
    await revokeInvite(deps, { inviteId: ana.id, userId: "admin1" });
    const list = await listInvites(deps, { groupId: "g1", userId: "admin1" });
    expect(list.map((i) => i.email)).toEqual(["luis@correo.com"]);
    await expect(listInvites(deps, { groupId: "g1", userId: "stranger" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("randomTokenGenerator", () => {
  it("produces long, url-safe, distinct tokens", () => {
    const a = randomTokenGenerator.next();
    const b = randomTokenGenerator.next();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
