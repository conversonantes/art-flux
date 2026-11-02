import type { InMemoryGroupsRepo } from "../groups";
import { InviteInvalidError, type Invite, type InvitesRepo } from "./invite";

export class InMemoryInvitesRepo implements InvitesRepo {
  readonly invites: Invite[] = [];

  /** `groups` is where accepted invitations add their members. */
  constructor(private readonly groups: InMemoryGroupsRepo) {}

  async save(invite: Invite): Promise<void> {
    this.invites.push(invite);
  }

  async findById(inviteId: string): Promise<Invite | null> {
    return this.invites.find((i) => i.id === inviteId) ?? null;
  }

  async findByToken(token: string): Promise<Invite | null> {
    return this.invites.find((i) => i.token === token) ?? null;
  }

  async listByGroup(groupId: string): Promise<Invite[]> {
    return this.invites
      .filter((i) => i.groupId === groupId && !i.revokedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revoke(inviteId: string, at: Date): Promise<void> {
    const invite = this.invites.find((i) => i.id === inviteId);
    if (invite && !invite.revokedAt) invite.revokedAt = at;
  }

  async accept(invite: Invite, userId: string, at: Date): Promise<void> {
    // The stored object is the source of truth, like a locked row in the database.
    const stored = this.invites.find((i) => i.id === invite.id);
    if (!stored || stored.revokedAt || stored.acceptedAt) throw new InviteInvalidError();
    stored.acceptedBy = userId;
    stored.acceptedAt = at;
    await this.groups.addMember({ groupId: stored.groupId, userId, role: "member" });
  }
}
