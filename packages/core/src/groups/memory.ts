import type { Group, Member, MemberRole } from "./group";
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

  async getById(groupId: string): Promise<Group | null> {
    return this.groups.find((g) => g.id === groupId) ?? null;
  }

  async getMemberRole(groupId: string, userId: string): Promise<MemberRole | null> {
    return this.members.find((m) => m.groupId === groupId && m.userId === userId)?.role ?? null;
  }

  async addMember(member: Member): Promise<void> {
    if (await this.getMemberRole(member.groupId, member.userId)) return;
    this.members.push(member);
  }
}
