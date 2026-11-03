import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SlugTakenError,
  type Project,
  type ProjectPatch,
  type ProjectStatus,
  type ProjectsRepo,
  type TeamMember,
} from "@art-flux/core";

interface ProjectRow {
  id: string;
  group_id: string;
  slug: string;
  title: string;
  status: ProjectStatus;
  themes: string[];
  visibility_agreement: string | null;
  origin_session_id: string | null;
  created_at: string;
}

const COLUMNS = "id, group_id, slug, title, status, themes, visibility_agreement, origin_session_id, created_at";

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  groupId: r.group_id,
  slug: r.slug,
  title: r.title,
  status: r.status,
  themes: r.themes,
  ...(r.visibility_agreement ? { visibilityAgreement: r.visibility_agreement } : {}),
  ...(r.origin_session_id ? { originSessionId: r.origin_session_id } : {}),
  createdAt: new Date(r.created_at),
});

export class SupabaseProjectsRepo implements ProjectsRepo {
  constructor(private readonly db: SupabaseClient) {}

  async slugExists(groupId: string, slug: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("projects")
      .select("id")
      .eq("group_id", groupId)
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async create(project: Project): Promise<void> {
    const { error } = await this.db.from("projects").insert({
      id: project.id,
      group_id: project.groupId,
      slug: project.slug,
      title: project.title,
      status: project.status,
      themes: project.themes,
      visibility_agreement: project.visibilityAgreement ?? null,
      created_at: project.createdAt.toISOString(),
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("projects_group_slug_key")) {
        throw new SlugTakenError(project.slug);
      }
      throw error;
    }
  }

  async getById(projectId: string): Promise<Project | null> {
    const { data, error } = await this.db
      .from("projects")
      .select(COLUMNS)
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toProject(data as ProjectRow) : null;
  }

  async getBySlug(groupId: string, slug: string): Promise<Project | null> {
    const { data, error } = await this.db
      .from("projects")
      .select(COLUMNS)
      .eq("group_id", groupId)
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toProject(data as ProjectRow) : null;
  }

  async listByGroup(groupId: string): Promise<Project[]> {
    const { data, error } = await this.db
      .from("projects")
      .select(COLUMNS)
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as ProjectRow[]).map(toProject);
  }

  async update(projectId: string, patch: ProjectPatch): Promise<Project> {
    const changes: Record<string, unknown> = {};
    if (patch.title !== undefined) changes.title = patch.title;
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.themes !== undefined) changes.themes = patch.themes;
    if (patch.visibilityAgreement !== undefined) changes.visibility_agreement = patch.visibilityAgreement;

    const query = this.db.from("projects");
    // An empty patch would be an invalid UPDATE; just read the current row.
    if (Object.keys(changes).length === 0) {
      const current = await this.getById(projectId);
      if (!current) throw new Error("project not found");
      return current;
    }
    const { data, error } = await query.update(changes).eq("id", projectId).select(COLUMNS).single();
    if (error) throw error;
    return toProject(data as ProjectRow);
  }

  async listTeam(projectId: string): Promise<TeamMember[]> {
    const { data, error } = await this.db
      .from("project_team")
      .select("user_id, roles, created_at, profiles(display_name)")
      .eq("project_id", projectId)
      .order("created_at");
    if (error) throw error;
    type Row = {
      user_id: string;
      roles: string[];
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    return (data as unknown as Row[]).map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const displayName = profile?.display_name;
      return { userId: r.user_id, roles: r.roles, ...(displayName ? { displayName } : {}) };
    });
  }

  async setRoles(projectId: string, userId: string, roles: string[]): Promise<void> {
    const { error } = await this.db
      .from("project_team")
      .upsert({ project_id: projectId, user_id: userId, roles }, { onConflict: "project_id,user_id" });
    if (error) throw error;
  }

  async removeFromTeam(projectId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("project_team")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) throw error;
  }
}
