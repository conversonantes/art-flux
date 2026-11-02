import type { Group, Member } from "./group";
import { HandleTakenError, type GroupsRepo } from "./repo";

export class InMemoryGroupsRepo implements GroupsRepo {
  readonly groups: Group[] = [];
  readonly members: Member[] = [];

  async handleExists(handle: string): Promise<boolean> {
    return this.groups.some((g) => g.handle === handle);
  }

  async create(group: Group, admin: Member): Promise<void> {
    if (this.groups.some((g) => g.handle === group.handle)) {
      throw new HandleTakenError(group.handle);
    }
    this.groups.push(group);
    this.members.push(admin);
  }

  async listByUser(userId: string): Promise<Group[]> {
    const ids = new Set(this.members.filter((m) => m.userId === userId).map((m) => m.groupId));
    return this.groups.filter((g) => ids.has(g.id));
  }
}
