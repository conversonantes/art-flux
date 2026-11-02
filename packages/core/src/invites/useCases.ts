import { ForbiddenError } from "../errors";
import type { Group, Clock, GroupsRepo } from "../groups";
import { InviteInvalidError, type Invite, type InvitesRepo, type TokenGenerator } from "./invite";

export interface InviteDeps {
  groups: GroupsRepo;
  invites: InvitesRepo;
  clock: Clock;
  tokens: TokenGenerator;
}

async function requireAdmin(deps: InviteDeps, groupId: string, userId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(groupId, userId)) !== "admin") throw new ForbiddenError();
}

/** Admin generates the group's link. Any previous active link is revoked: one at a time. */
export async function createInvite(
  deps: InviteDeps,
  input: { id: string; groupId: string; userId: string },
): Promise<Invite> {
  await requireAdmin(deps, input.groupId, input.userId);
  const now = deps.clock.now();

  const previous = await deps.invites.findActiveByGroup(input.groupId);
  if (previous) await deps.invites.revoke(previous.id, now);

  const invite: Invite = {
    id: input.id,
    groupId: input.groupId,
    token: deps.tokens.next(),
    createdBy: input.userId,
    createdAt: now,
  };
  await deps.invites.save(invite);
  return invite;
}

/** Admin cancels the active link. Idempotent. */
export async function revokeInvite(
  deps: InviteDeps,
  input: { groupId: string; userId: string },
): Promise<void> {
  await requireAdmin(deps, input.groupId, input.userId);
  const active = await deps.invites.findActiveByGroup(input.groupId);
  if (active) await deps.invites.revoke(active.id, deps.clock.now());
}

/** Whoever opens the link and is logged in becomes a member. Idempotent for existing members. */
export async function acceptInvite(
  deps: InviteDeps,
  input: { token: string; userId: string },
): Promise<Group> {
  const invite = await deps.invites.findByToken(input.token);
  if (!invite || invite.revokedAt) throw new InviteInvalidError();

  const group = await deps.groups.getById(invite.groupId);
  if (!group) throw new InviteInvalidError();

  await deps.groups.addMember({ groupId: group.id, userId: input.userId, role: "member" });
  return group;
}
