import type { Media } from "./media";
import type { MediaFilter, MediaRepo } from "./repo";

export class InMemoryMediaRepo implements MediaRepo {
  readonly items: Media[] = [];
  private readonly removed = new Set<string>();

  private visible(viewerId: string) {
    return this.items.filter(
      (m) => !this.removed.has(m.id) && (m.status === "uploaded" || m.createdBy === viewerId),
    );
  }

  async getById(mediaId: string, viewerId: string): Promise<Media | null> {
    return this.visible(viewerId).find((m) => m.id === mediaId) ?? null;
  }

  async create(media: Media): Promise<void> {
    if (this.items.some((m) => m.id === media.id)) return;
    this.items.push(media);
  }

  async list(filter: MediaFilter, viewerId: string): Promise<Media[]> {
    return this.visible(viewerId)
      .filter(
        (m) =>
          m.projectId === filter.projectId &&
          (filter.sessionId === undefined || m.sessionId === filter.sessionId) &&
          (filter.approachId === undefined || m.approachId === filter.approachId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async confirm(mediaId: string): Promise<Media> {
    const media = this.items.find((m) => m.id === mediaId && !this.removed.has(m.id));
    if (!media) throw new Error("media not found");
    media.status = "uploaded";
    return media;
  }

  async remove(mediaId: string): Promise<void> {
    this.removed.add(mediaId);
  }
}
