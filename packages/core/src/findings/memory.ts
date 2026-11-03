import type { FindingFragment } from "./finding";
import type { FindingsRepo } from "./repo";

export class InMemoryFindingsRepo implements FindingsRepo {
  readonly fragments: FindingFragment[] = [];
  private readonly removed = new Set<string>();

  private active() {
    return this.fragments.filter((f) => !this.removed.has(f.id));
  }

  async getById(fragmentId: string): Promise<FindingFragment | null> {
    return this.active().find((f) => f.id === fragmentId) ?? null;
  }

  async listByApproach(approachId: string): Promise<FindingFragment[]> {
    return this.active()
      .filter((f) => f.approachId === approachId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByApproaches(approachIds: string[]): Promise<FindingFragment[]> {
    return this.active().filter((f) => approachIds.includes(f.approachId));
  }

  async create(fragment: FindingFragment): Promise<void> {
    if (this.fragments.some((f) => f.id === fragment.id)) return;
    this.fragments.push(fragment);
  }

  async updateText(fragmentId: string, text: string, now: Date): Promise<FindingFragment> {
    const fragment = await this.getById(fragmentId);
    if (!fragment) throw new Error("fragment not found");
    fragment.text = text;
    fragment.updatedAt = now;
    return fragment;
  }

  async remove(fragmentId: string): Promise<void> {
    this.removed.add(fragmentId);
  }
}
