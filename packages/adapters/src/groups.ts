import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HandleTakenError,
  type Group,
  type GroupMember,
  type GroupsRepo,
  type Member,
  type MemberRole,
} from "@art-flux/core";

interface GroupRow {
  id: string;
  handle: string;
  name: string;
  city: string | null;
  created_at: string;
}

const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  handle: r.handle,
  name: r.name,
  ...(r.city ? { city: r.city } : {}),
  createdAt: new Date(r.created_at),
});

/**
 * Groups on Supabase. Pass a client carrying the *user's* JWT so RLS applies;
 * never the service_role client from a request path.
 */
export class SupabaseGroupsRepo implements GroupsRepo {
  constructor(private readonly db: SupabaseClient) {}

  async handleExists(handle: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("handle_exists", { p_handle: handle });
    if (error) throw error;
    return data === true;
  }

  async create(group: Group, _admin: Member): Promise<void> {
    // The database makes the caller (auth.uid()) the first admin; _admin is the core's intent.
    const { error } = await this.db.rpc("create_group", {
      p_id: group.id,
      p_handle: group.handle,
      p_name: group.name,
      p_city: group.city ?? null,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("groups_handle_key")) {
        throw new HandleTakenError(group.handle);
      }
      throw error;
    }
  }

  async listByUser(_userId: string): Promise<Group[]> {
    // RLS only returns the caller's groups, so the id is implied by the session.
    const { data, error } = await this.db
      .from("groups")
      .select("id, handle, name, city, created_at")
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw error;
    return (data as GroupRow[]).map(toGroup);
  }

  async countAdminOf(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("members")
      .select("group_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("deleted_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  async getById(groupId: string): Promise<Group | null> {
    const { data, error } = await this.db
      .from("groups")
      .select("id, handle, name, city, created_at")
      .eq("id", groupId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toGroup(data as GroupRow) : null;
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    // Names come from profiles; RLS only lets co-members read them.
    const { data, error } = await this.db
      .from("members")
      .select("user_id, role, created_at, profiles(display_name)")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw error;
    type Row = {
      user_id: string;
      role: MemberRole;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    return (data as unknown as Row[]).map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const displayName = profile?.display_name;
      return { userId: r.user_id, role: r.role, ...(displayName ? { displayName } : {}) };
    });
  }

  async getMemberRole(groupId: string, userId: string): Promise<MemberRole | null> {
    const { data, error } = await this.db
      .from("members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as MemberRole | undefined) ?? null;
  }
}
