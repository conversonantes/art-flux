import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  InMemoryGroupsRepo,
  InMemoryInvitesRepo,
  InviteInvalidError,
  acceptInvite,
  createGroup,
  createInvite,
  listInvites,
  randomTokenGenerator,
  revokeInvite,
} from "../index";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const groups = new InMemoryGroupsRepo();
  const invites = new InMemoryInvitesRepo(groups);
  let n = 0;
  let time = new Date("2026-11-02T10:00:00Z").getTime();
  const clock = { now: () => new Date(time) };
  const deps = { groups, invites, clock, tokens: { next: () => `token-${++n}` } };
  await createGroup({ groups, clock }, { id: "g1", userId: "admin1", name: "Conversonantes" });
  return {
    groups,
    invites,
    deps,
    advance: (ms: number) => void (time += ms),
    invite: (id: string, label?: string) =>
      createInvite(deps, { id, groupId: "g1", userId: "admin1", ...(label ? { label } : {}) }),
  };
}

describe("createInvite", () => {
  it("lets an admin create a link valid for 7 days", async () => {
    const { invite } = await setup();
    const inv = await invite("i1", "  para Ana ");
    expect(inv.token).toBe("token-1");
    expect(inv.label).toBe("para Ana");
    expect(inv.expiresAt.getTime() - inv.createdAt.getTime()).toBe(7 * DAY);
  });

  it("rejects non-admins and outsiders", async () => {
    const { deps, invite } = await setup();
    const inv = await invite("i1");
    await acceptInvite(deps, { token: inv.token, userId: "ana" });
    for (const userId of ["ana", "stranger"]) {
      await expect(createInvite(deps, { id: "x", groupId: "g1", userId })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("allows several live links in the same group", async () => {
    const { deps, invite } = await setup();
    const a = await invite("i1");
    const b = await invite("i2");
    await expect(acceptInvite(deps, { token: a.token, userId: "ana" })).resolves.toBeDefined();
    await expect(acceptInvite(deps, { token: b.token, userId: "luis" })).resolves.toBeDefined();
  });
});

describe("acceptInvite: single use", () => {
  it("makes whoever opens the link a member and spends it", async () => {
    const { deps, groups, invites, invite } = await setup();
    const { token } = await invite("i1");
    const group = await acceptInvite(deps, { token, userId: "ana" });
    expect(group.id).toBe("g1");
    expect(await groups.getMemberRole("g1", "ana")).toBe("member");
    expect(invites.invites[0]?.acceptedBy).toBe("ana");
  });

  it("refuses a second person once the link is spent", async () => {
    const { deps, groups, invite } = await setup();
    const { token } = await invite("i1");
    await acceptInvite(deps, { token, userId: "ana" });
    await expect(acceptInvite(deps, { token, userId: "intruder" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
    expect(await groups.getMemberRole("g1", "intruder")).toBeNull();
  });

  it("lets the same person reload without error", async () => {
    const { deps, groups, invite } = await setup();
    const { token } = await invite("i1");
    await acceptInvite(deps, { token, userId: "ana" });
    await expect(acceptInvite(deps, { token, userId: "ana" })).resolves.toMatchObject({ id: "g1" });
    expect(groups.members.filter((m) => m.userId === "ana")).toHaveLength(1);
  });

  it("does not spend the link when a member opens it, and never downgrades an admin", async () => {
    const { deps, groups, invites, invite } = await setup();
    const { token } = await invite("i1");
    await acceptInvite(deps, { token, userId: "admin1" });
    expect(invites.invites[0]?.acceptedAt).toBeUndefined();
    expect(await groups.getMemberRole("g1", "admin1")).toBe("admin");
    await expect(acceptInvite(deps, { token, userId: "ana" })).resolves.toBeDefined();
  });

  it("lets only one of two simultaneous openings in", async () => {
    const { deps, groups, invite } = await setup();
    const { token } = await invite("i1");
    const results = await Promise.allSettled([
      acceptInvite(deps, { token, userId: "ana" }),
      acceptInvite(deps, { token, userId: "luis" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(InviteInvalidError) });
    expect(groups.members.filter((m) => m.role === "member")).toHaveLength(1);
  });
});

describe("acceptInvite: expiry and unknown tokens", () => {
  it("works on day 7 and fails after it", async () => {
    const { deps, advance, invite } = await setup();
    const a = await invite("i1");
    const b = await invite("i2");
    advance(7 * DAY - 1);
    await expect(acceptInvite(deps, { token: a.token, userId: "ana" })).resolves.toBeDefined();
    advance(2);
    await expect(acceptInvite(deps, { token: b.token, userId: "luis" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("rejects unknown tokens", async () => {
    const { deps } = await setup();
    await expect(acceptInvite(deps, { token: "nope", userId: "u" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });
});

describe("revokeInvite / listInvites", () => {
  it("cancels a link before it is used", async () => {
    const { deps, invite } = await setup();
    const inv = await invite("i1");
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
    await expect(acceptInvite(deps, { token: inv.token, userId: "ana" })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("keeps people who already joined", async () => {
    const { deps, groups, invite } = await setup();
    const inv = await invite("i1");
    await acceptInvite(deps, { token: inv.token, userId: "ana" });
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
    expect(await groups.getMemberRole("g1", "ana")).toBe("member");
  });

  it("is admin-only and idempotent", async () => {
    const { deps, invite } = await setup();
    const inv = await invite("i1");
    await expect(revokeInvite(deps, { inviteId: inv.id, userId: "stranger" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(revokeInvite(deps, { inviteId: "missing", userId: "admin1" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
    await revokeInvite(deps, { inviteId: inv.id, userId: "admin1" });
  });

  it("lists pending and used links with who used them, to admins only", async () => {
    const { deps, advance, invite } = await setup();
    const used = await invite("i1", "para Ana");
    advance(1000);
    await invite("i2", "para Luis");
    const revoked = await invite("i3");
    await acceptInvite(deps, { token: used.token, userId: "ana" });
    await revokeInvite(deps, { inviteId: revoked.id, userId: "admin1" });

    const list = await listInvites(deps, { groupId: "g1", userId: "admin1" });
    expect(list.map((i) => [i.label, i.acceptedBy])).toEqual([
      ["para Luis", undefined],
      ["para Ana", "ana"],
    ]);
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
