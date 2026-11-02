import type { SupabaseClient } from "@supabase/supabase-js";
import { InviteInvalidError, type Invite, type InvitesRepo } from "@art-flux/core";

interface InviteRow {
  id: string;
  group_id: string;
  token: string;
  label: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
}

const COLUMNS =
  "id, group_id, token, label, created_by, created_at, expires_at, accepted_by, accepted_at, revoked_at";

const toInvite = (r: InviteRow): Invite => ({
  id: r.id,
  groupId: r.group_id,
  token: r.token,
  ...(r.label ? { label: r.label } : {}),
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
  expiresAt: new Date(r.expires_at),
  ...(r.accepted_by ? { acceptedBy: r.accepted_by } : {}),
  ...(r.accepted_at ? { acceptedAt: new Date(r.accepted_at) } : {}),
  ...(r.revoked_at ? { revokedAt: new Date(r.revoked_at) } : {}),
});

export class SupabaseInvitesRepo implements InvitesRepo {
  constructor(private readonly db: SupabaseClient) {}

  async save(invite: Invite): Promise<void> {
    const { error } = await this.db.from("invites").insert({
      id: invite.id,
      group_id: invite.groupId,
      token: invite.token,
      label: invite.label ?? null,
      created_by: invite.createdBy,
      created_at: invite.createdAt.toISOString(),
      expires_at: invite.expiresAt.toISOString(),
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

  async listByGroup(groupId: string): Promise<Invite[]> {
    const { data, error } = await this.db
      .from("invites")
      .select(COLUMNS)
      .eq("group_id", groupId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
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

  async accept(invite: Invite, _userId: string, _at: Date): Promise<void> {
    // The database spends the link atomically and re-validates token, revocation and expiry;
    // the user comes from the session (auth.uid()) and the time from the database clock.
    const { error } = await this.db.rpc("accept_invite", { p_token: invite.token });
    if (error) {
      if (error.code === "P0002") throw new InviteInvalidError();
      throw error;
    }
  }
}
