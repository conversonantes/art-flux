import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ForbiddenError,
  type Media,
  type MediaFilter,
  type MediaKind,
  type MediaRepo,
} from "@art-flux/core";

interface MediaRow {
  id: string;
  group_id: string;
  project_id: string;
  session_id: string | null;
  approach_id: string | null;
  kind: MediaKind;
  title: string | null;
  path: string | null;
  mime: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  url: string | null;
  body: string | null;
  status: "pending" | "uploaded";
  created_by: string;
  created_at: string;
}

const COLUMNS =
  "id, group_id, project_id, session_id, approach_id, kind, title, path, mime, size_bytes, duration_seconds, url, body, status, created_by, created_at";

const toMedia = (r: MediaRow): Media => ({
  id: r.id,
  groupId: r.group_id,
  projectId: r.project_id,
  ...(r.session_id ? { sessionId: r.session_id } : {}),
  ...(r.approach_id ? { approachId: r.approach_id } : {}),
  kind: r.kind,
  ...(r.title ? { title: r.title } : {}),
  ...(r.path ? { path: r.path } : {}),
  ...(r.mime ? { mime: r.mime } : {}),
  ...(r.size_bytes !== null ? { sizeBytes: Number(r.size_bytes) } : {}),
  ...(r.duration_seconds !== null ? { durationSeconds: r.duration_seconds } : {}),
  ...(r.url ? { url: r.url } : {}),
  ...(r.body ? { body: r.body } : {}),
  status: r.status,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
});

/**
 * Material rows. Row-level security shows each person what they may read (uploaded material of
 * their group, plus their own pending uploads), so `viewerId` needs no filtering here.
 */
export class SupabaseMediaRepo implements MediaRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getById(mediaId: string): Promise<Media | null> {
    const { data, error } = await this.db
      .from("media")
      .select(COLUMNS)
      .eq("id", mediaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toMedia(data as MediaRow) : null;
  }

  async create(media: Media): Promise<void> {
    // The client's id makes a retried request harmless: a second insert of the same id does nothing.
    const { error } = await this.db.from("media").upsert(
      {
        id: media.id,
        group_id: media.groupId,
        project_id: media.projectId,
        session_id: media.sessionId ?? null,
        approach_id: media.approachId ?? null,
        kind: media.kind,
        title: media.title ?? null,
        path: media.path ?? null,
        mime: media.mime ?? null,
        size_bytes: media.sizeBytes ?? null,
        duration_seconds: media.durationSeconds ?? null,
        url: media.url ?? null,
        body: media.body ?? null,
        status: media.status,
        created_by: media.createdBy,
        created_at: media.createdAt.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  async list(filter: MediaFilter): Promise<Media[]> {
    let query = this.db.from("media").select(COLUMNS).eq("project_id", filter.projectId).is("deleted_at", null);
    if (filter.sessionId) query = query.eq("session_id", filter.sessionId);
    if (filter.approachId) query = query.eq("approach_id", filter.approachId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data as MediaRow[]).map(toMedia);
  }

  async confirm(mediaId: string): Promise<Media> {
    // An RPC: the column is not writable directly, and only the author may confirm.
    const { data, error } = await this.db.rpc("confirm_media", { p_media: mediaId });
    if (error) {
      if (error.code === "P0004") throw new ForbiddenError("No se pudo confirmar el archivo");
      throw error;
    }
    return toMedia(data as MediaRow);
  }

  async remove(mediaId: string): Promise<void> {
    const { error } = await this.db.rpc("remove_media", { p_media: mediaId });
    if (error) {
      if (error.code === "P0004") throw new ForbiddenError("No se pudo quitar el material");
      throw error;
    }
  }
}
