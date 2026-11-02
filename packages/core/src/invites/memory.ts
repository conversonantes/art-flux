import type { Invite, InvitesRepo } from "./invite";

export class InMemoryInvitesRepo implements InvitesRepo {
  readonly invites: Invite[] = [];

  async save(invite: Invite): Promise<void> {
    this.invites.push(invite);
  }

  async findById(inviteId: string): Promise<Invite | null> {
    return this.invites.find((i) => i.id === inviteId) ?? null;
  }

  async findByToken(token: string): Promise<Invite | null> {
    return this.invites.find((i) => i.token === token) ?? null;
  }

  async findActiveByGroupAndEmail(groupId: string, email: string): Promise<Invite | null> {
    return (
      this.invites.find((i) => i.groupId === groupId && i.email === email && !i.revokedAt) ?? null
    );
  }

  async listActiveByGroup(groupId: string): Promise<Invite[]> {
    return this.invites.filter((i) => i.groupId === groupId && !i.revokedAt);
  }

  async revoke(inviteId: string, at: Date): Promise<void> {
    const invite = this.invites.find((i) => i.id === inviteId);
    if (invite && !invite.revokedAt) invite.revokedAt = at;
  }
}
