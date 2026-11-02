import type { Project, ProjectPatch, TeamMember } from "./project";
import { SlugTakenError, type ProjectsRepo } from "./repo";

export class InMemoryProjectsRepo implements ProjectsRepo {
  readonly projects: Project[] = [];
  readonly team = new Map<string, Map<string, string[]>>();
  /** Test helper: the names profiles would carry. */
  readonly displayNames = new Map<string, string>();

  async slugExists(groupId: string, slug: string): Promise<boolean> {
    return this.projects.some((p) => p.groupId === groupId && p.slug === slug);
  }

  async create(project: Project): Promise<void> {
    if (await this.slugExists(project.groupId, project.slug)) throw new SlugTakenError(project.slug);
    this.projects.push(project);
  }

  async getById(projectId: string): Promise<Project | null> {
    return this.projects.find((p) => p.id === projectId) ?? null;
  }

  async getBySlug(groupId: string, slug: string): Promise<Project | null> {
    return this.projects.find((p) => p.groupId === groupId && p.slug === slug) ?? null;
  }

  async listByGroup(groupId: string): Promise<Project[]> {
    return this.projects
      .filter((p) => p.groupId === groupId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(projectId: string, patch: ProjectPatch): Promise<Project> {
    const project = await this.getById(projectId);
    if (!project) throw new Error("project not found");
    const { visibilityAgreement, ...rest } = patch;
    Object.assign(project, rest);
    if (visibilityAgreement === null) delete project.visibilityAgreement;
    else if (visibilityAgreement !== undefined) project.visibilityAgreement = visibilityAgreement;
    return project;
  }

  async listTeam(projectId: string): Promise<TeamMember[]> {
    return [...(this.team.get(projectId) ?? new Map<string, string[]>())].map(([userId, roles]) => {
      const displayName = this.displayNames.get(userId);
      return { userId, roles, ...(displayName ? { displayName } : {}) };
    });
  }

  async setRoles(projectId: string, userId: string, roles: string[]): Promise<void> {
    const members = this.team.get(projectId) ?? new Map<string, string[]>();
    members.set(userId, roles);
    this.team.set(projectId, members);
  }

  async removeFromTeam(projectId: string, userId: string): Promise<void> {
    this.team.get(projectId)?.delete(userId);
  }
}
