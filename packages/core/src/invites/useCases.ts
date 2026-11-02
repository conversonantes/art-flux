import { ForbiddenError } from "../errors";
import type { Clock, Group, GroupsRepo } from "../groups";
import {
  InviteEmailMismatchError,
  InviteInvalidError,
  emailSchema,
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

async function requireAdmin(deps: InviteDeps, groupId: string, userId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(groupId, userId)) !== "admin") throw new ForbiddenError();
}

/**
 * Admin invites one email. Re-inviting the same email revokes its previous active
 * link, so each person has at most one live link per group.
 */
export async function createInvite(
  deps: InviteDeps,
  input: { id: string; groupId: string; userId: string; email: string },
): Promise<Invite> {
  await requireAdmin(deps, input.groupId, input.userId);
  const email = emailSchema.parse(input.email);
  const now = deps.clock.now();

  const previous = await deps.invites.findActiveByGroupAndEmail(input.groupId, email);
  if (previous) await deps.invites.revoke(previous.id, now);

  const invite: Invite = {
    id: input.id,
    groupId: input.groupId,
    email,
    token: deps.tokens.next(),
    createdBy: input.userId,
    createdAt: now,
  };
  await deps.invites.save(invite);
  return invite;
}

/** Pending invitations of a group, for the admin's screen. */
export async function listInvites(
  deps: InviteDeps,
  input: { groupId: string; userId: string },
): Promise<Invite[]> {
  await requireAdmin(deps, input.groupId, input.userId);
  return deps.invites.listActiveByGroup(input.groupId);
}

/** Admin cancels one invitation. Idempotent; people who already joined stay. */
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
 * Whoever opens the link must be logged in with the invited email.
 * `userEmail` is the verified email of the session, never user-typed input.
 * Idempotent for existing members.
 */
export async function acceptInvite(
  deps: InviteDeps,
  input: { token: string; userId: string; userEmail: string },
): Promise<Group> {
  const invite = await deps.invites.findByToken(input.token);
  if (!invite || invite.revokedAt) throw new InviteInvalidError();

  const group = await deps.groups.getById(invite.groupId);
  if (!group) throw new InviteInvalidError();

  const email = emailSchema.safeParse(input.userEmail);
  if (!email.success || email.data !== invite.email) throw new InviteEmailMismatchError();

  await deps.groups.addMember({ groupId: group.id, userId: input.userId, role: "member" });
  return group;
}
