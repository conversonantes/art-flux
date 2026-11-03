import type { Approach, ApproachPatch } from "./approach";
import type { ApproachesRepo } from "./repo";

export class InMemoryApproachesRepo implements ApproachesRepo {
  readonly approaches: Approach[] = [];
  private readonly removed = new Set<string>();

  private active(sessionId: string) {
    return this.approaches.filter((a) => a.sessionId === sessionId && !this.removed.has(a.id));
  }

  async nextPosition(sessionId: string): Promise<number> {
    const positions = this.active(sessionId).map((a) => a.position);
    return positions.length ? Math.max(...positions) + 1 : 1;
  }

  async create(approach: Approach): Promise<void> {
    this.approaches.push(approach);
  }

  async getById(approachId: string): Promise<Approach | null> {
    const found = this.approaches.find((a) => a.id === approachId);
    return found && !this.removed.has(found.id) ? found : null;
  }

  async listBySession(sessionId: string): Promise<Approach[]> {
    return this.active(sessionId).sort(
      (a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async listBySessions(sessionIds: string[]): Promise<Approach[]> {
    return this.approaches.filter((a) => sessionIds.includes(a.sessionId) && !this.removed.has(a.id));
  }

  async update(approachId: string, patch: ApproachPatch): Promise<Approach> {
    const approach = await this.getById(approachId);
    if (!approach) throw new Error("approach not found");
    Object.assign(approach, patch);
    return approach;
  }

  async setNote(approachId: string, note: string | null): Promise<Approach> {
    const approach = await this.getById(approachId);
    if (!approach) throw new Error("approach not found");
    if (note === null) delete approach.note;
    else approach.note = note;
    return approach;
  }

  async remove(approachId: string): Promise<void> {
    this.removed.add(approachId);
  }

  async reorder(sessionId: string, orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const approach = this.approaches.find((a) => a.id === id && a.sessionId === sessionId);
      if (approach) approach.position = index + 1;
    });
  }
}
