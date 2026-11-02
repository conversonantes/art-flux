import type { SupabaseClient } from "@supabase/supabase-js";
import { HandleTakenError, type Group, type GroupsRepo, type Member, type MemberRole } from "@art-flux/core";

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
