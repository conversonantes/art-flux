import type { SupabaseClient } from "@supabase/supabase-js";
import { InviteEmailMismatchError, InviteInvalidError, type Invite, type InvitesRepo } from "@art-flux/core";

interface InviteRow {
  id: string;
  group_id: string;
  email: string;
  token: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

const COLUMNS = "id, group_id, email, token, created_by, created_at, revoked_at";

const toInvite = (r: InviteRow): Invite => ({
  id: r.id,
  groupId: r.group_id,
  email: r.email,
  token: r.token,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
  ...(r.revoked_at ? { revokedAt: new Date(r.revoked_at) } : {}),
});

export class SupabaseInvitesRepo implements InvitesRepo {
  constructor(private readonly db: SupabaseClient) {}

  async save(invite: Invite): Promise<void> {
    const { error } = await this.db.from("invites").insert({
      id: invite.id,
      group_id: invite.groupId,
      email: invite.email,
      token: invite.token,
      created_by: invite.createdBy,
      created_at: invite.createdAt.toISOString(),
    });
    if (error) throw error;
  }

  async findById(inviteId: string): Promise<Invite | null> {
    const { data, error } = await this.db.from("invites").select(COLUMNS).eq("id", inviteId).maybeSingle();
    if (error) throw error;
    return data ? toInvite(data as InviteRow) : null;
  }

  async findByToken(token: string): Promise<Invite | null> {
    // RPC: the person opening the link is not a member yet, so RLS would hide the row.
    const { data, error } = await this.db.rpc("find_invite_by_token", { p_token: token });
    if (error) throw error;
    const row = (data as InviteRow[] | null)?.[0];
    return row ? toInvite(row) : null;
  }

  async findActiveByGroupAndEmail(groupId: string, email: string): Promise<Invite | null> {
    const { data, error } = await this.db
      .from("invites")
      .select(COLUMNS)
      .eq("group_id", groupId)
      .eq("email", email)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toInvite(data as InviteRow) : null;
  }

  async listActiveByGroup(groupId: string): Promise<Invite[]> {
    const { data, error } = await this.db
      .from("invites")
      .select(COLUMNS)
      .eq("group_id", groupId)
      .is("revoked_at", null)
      .order("created_at");
    if (error) throw error;
    return (data as InviteRow[]).map(toInvite);
  }

  async revoke(inviteId: string, at: Date): Promise<void> {
    const { error } = await this.db
      .from("invites")
      .update({ revoked_at: at.toISOString() })
      .eq("id", inviteId)
      .is("revoked_at", null);
    if (error) throw error;
  }

  async accept(invite: Invite, _userId: string): Promise<void> {
    // The database re-validates token, revocation and the session's confirmed email.
    const { error } = await this.db.rpc("accept_invite", { p_token: invite.token });
    if (error) {
      if (error.code === "P0002") throw new InviteInvalidError();
      if (error.code === "P0003") throw new InviteEmailMismatchError();
      throw error;
    }
  }
}
