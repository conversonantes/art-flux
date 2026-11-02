import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InMemoryGroupsRepo,
  InMemoryInvitesRepo,
  InviteInvalidError,
  acceptInvite,
  createGroup,
  createInvite,
  randomTokenGenerator,
  revokeInvite,
} from "../index";

const clock = { now: () => new Date("2026-11-02T10:00:00Z") };

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const invites = new InMemoryInvitesRepo();
  let n = 0;
  const tokens = { next: () => `token-${++n}` };
  const deps = { groups, invites, clock, tokens };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin1", name: "Conversonantes" });
  return { groups, invites, deps };
}

describe("createInvite", () => {
  it("lets an admin generate a link", async () => {
    const { deps } = await setup();
    const invite = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    expect(invite.token).toBe("token-1");
    expect(invite.revokedAt).toBeUndefined();
  });

  it("rejects non-admins and outsiders", async () => {
    const { deps } = await setup();
    const link = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await acceptInvite(deps, { token: link.token, userId: "member1" });
    await expect(
      createInvite(deps, { id: "i2", groupId: "g1", userId: "member1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createInvite(deps, { id: "i3", groupId: "g1", userId: "stranger" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("revokes the previous link when generating a new one", async () => {
    const { deps } = await setup();
    const a = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    const b = await createInvite(deps, { id: "i2", groupId: "g1", userId: "admin1" });
    await expect(acceptInvite(deps, { token: a.token, userId: "u2" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
    await expect(acceptInvite(deps, { token: b.token, userId: "u2" })).resolves.toMatchObject({
      id: "g1",
    });
  });
});

describe("acceptInvite", () => {
  it("makes whoever opens the link a member", async () => {
    const { deps, groups } = await setup();
    const { token } = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    const group = await acceptInvite(deps, { token, userId: "u2" });
    expect(group.id).toBe("g1");
    expect(await groups.getMemberRole("g1", "u2")).toBe("member");
  });

  it("lets several people use the same link", async () => {
    const { deps, groups } = await setup();
    const { token } = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await acceptInvite(deps, { token, userId: "u2" });
    await acceptInvite(deps, { token, userId: "u3" });
    expect(await groups.getMemberRole("g1", "u3")).toBe("member");
  });

  it("is idempotent and never downgrades an admin", async () => {
    const { deps, groups } = await setup();
    const { token } = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await acceptInvite(deps, { token, userId: "admin1" });
    await acceptInvite(deps, { token, userId: "u2" });
    await acceptInvite(deps, { token, userId: "u2" });
    expect(await groups.getMemberRole("g1", "admin1")).toBe("admin");
    expect(groups.members.filter((m) => m.userId === "u2")).toHaveLength(1);
  });

  it("rejects unknown tokens", async () => {
    const { deps } = await setup();
    await expect(acceptInvite(deps, { token: "nope", userId: "u2" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });
});

describe("revokeInvite", () => {
  it("cancels the link so it no longer admits anyone", async () => {
    const { deps } = await setup();
    const { token } = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await revokeInvite(deps, { groupId: "g1", userId: "admin1" });
    await expect(acceptInvite(deps, { token, userId: "u2" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("keeps people who already joined", async () => {
    const { deps, groups } = await setup();
    const { token } = await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await acceptInvite(deps, { token, userId: "u2" });
    await revokeInvite(deps, { groupId: "g1", userId: "admin1" });
    expect(await groups.getMemberRole("g1", "u2")).toBe("member");
  });

  it("is admin-only and idempotent", async () => {
    const { deps } = await setup();
    await expect(revokeInvite(deps, { groupId: "g1", userId: "stranger" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await revokeInvite(deps, { groupId: "g1", userId: "admin1" }); // no active link: fine
    await revokeInvite(deps, { groupId: "g1", userId: "admin1" });
  });

  it("allows generating a new link afterwards", async () => {
    const { deps } = await setup();
    await createInvite(deps, { id: "i1", groupId: "g1", userId: "admin1" });
    await revokeInvite(deps, { groupId: "g1", userId: "admin1" });
    const fresh = await createInvite(deps, { id: "i2", groupId: "g1", userId: "admin1" });
    await expect(acceptInvite(deps, { token: fresh.token, userId: "u2" })).resolves.toBeDefined();
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
