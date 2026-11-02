import { z } from "zod";
import { ForbiddenError } from "../errors";
import type { Clock, Group, GroupsRepo } from "../groups";
import {
  INVITE_TTL_DAYS,
  InviteInvalidError,
  type Invite,
  type InvitesRepo,
  type TokenGenerator,
} from "./invite";

export interface InviteDeps {
  groups: GroupsRepo;
  invites: InvitesRepo;
  clock: Clock;
  tokens: TokenGenerator;
}

const labelSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((l) => (l ? l : undefined));

async function requireAdmin(deps: InviteDeps, groupId: string, userId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(groupId, userId)) !== "admin") throw new ForbiddenError();
}

/** Admin creates a single-use link, valid for 7 days. One link per person to invite. */
export async function createInvite(
  deps: InviteDeps,
  input: { id: string; groupId: string; userId: string; label?: string },
): Promise<Invite> {
  await requireAdmin(deps, input.groupId, input.userId);
  const label = labelSchema.parse(input.label);
  const now = deps.clock.now();

  const invite: Invite = {
    id: input.id,
    groupId: input.groupId,
    token: deps.tokens.next(),
    ...(label ? { label } : {}),
    createdBy: input.userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
  await deps.invites.save(invite);
  return invite;
}

/** Links of a group for the admin's screen: pending, used (with who) and expired. */
export async function listInvites(
  deps: InviteDeps,
  input: { groupId: string; userId: string },
): Promise<Invite[]> {
  await requireAdmin(deps, input.groupId, input.userId);
  return deps.invites.listByGroup(input.groupId);
}

/** Admin cancels one link. Idempotent; people who already joined stay. */
export async function revokeInvite(
  deps: InviteDeps,
  input: { inviteId: string; userId: string },
): Promise<void> {
  const invite = await deps.invites.findById(input.inviteId);
  if (!invite) throw new ForbiddenError(); // do not reveal whether the id exists
  await requireAdmin(deps, invite.groupId, input.userId);
  await deps.invites.revoke(invite.id, deps.clock.now());
}

/**
 * Whoever opens the link while logged in joins the group, and the link is spent.
 * Idempotent for people already in the group (a reload, or the admin testing their own
 * link): they get the group back and the link is not spent.
 */
export async function acceptInvite(
  deps: InviteDeps,
  input: { token: string; userId: string },
): Promise<Group> {
  const invite = await deps.invites.findByToken(input.token);
  if (!invite || invite.revokedAt) throw new InviteInvalidError();

  const alreadyMember = (await deps.groups.getMemberRole(invite.groupId, input.userId)) !== null;
  if (!alreadyMember) {
    const now = deps.clock.now();
    if (invite.acceptedAt || invite.expiresAt <= now) throw new InviteInvalidError();
    await deps.invites.accept(invite, input.userId, now);
  }

  // Read the group only now: before joining, RLS hides it from a non-member.
  const group = await deps.groups.getById(invite.groupId);
  if (!group) throw new InviteInvalidError();
  return group;
}
