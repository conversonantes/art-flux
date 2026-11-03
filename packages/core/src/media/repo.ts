import type { Media } from "./media";

export interface MediaFilter {
  projectId: string;
  /** Only what belongs to this session (its approaches' material included). */
  sessionId?: string;
  /** Only what belongs to this approach. */
  approachId?: string;
}

export interface MediaRepo {
  /** Not removed, and visible to `viewerId`: anyone's uploaded material, or their own pending one. */
  getById(mediaId: string, viewerId: string): Promise<Media | null>;
  /** Saving an id that already exists is a no-op (a retried request). */
  create(media: Media): Promise<void>;
  /** Uploaded material, newest first, plus the viewer's own pending uploads. */
  list(filter: MediaFilter, viewerId: string): Promise<Media[]>;
  /** pending → uploaded. Adapters backed by a database re-check that only the author may. */
  confirm(mediaId: string): Promise<Media>;
  /** Soft delete. Adapters backed by a database re-check who may. */
  remove(mediaId: string): Promise<void>;
}
