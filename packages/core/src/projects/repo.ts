import type { Project, ProjectPatch, TeamMember } from "./project";

/** Thrown by the repo when the slug is already used in that group (also on races). */
export class SlugTakenError extends Error {
  constructor(public readonly slug: string) {
    super(`La dirección ${slug} ya está en uso`);
    this.name = "SlugTakenError";
  }
}

export interface ProjectsRepo {
  slugExists(groupId: string, slug: string): Promise<boolean>;
  /** Throws SlugTakenError. */
  create(project: Project): Promise<void>;
  getById(projectId: string): Promise<Project | null>;
  getBySlug(groupId: string, slug: string): Promise<Project | null>;
  /** Newest first. */
  listByGroup(groupId: string): Promise<Project[]>;
  update(projectId: string, patch: ProjectPatch): Promise<Project>;
  listTeam(projectId: string): Promise<TeamMember[]>;
  /** Adds the person to the team or replaces their roles. Idempotent. */
  setRoles(projectId: string, userId: string, roles: string[]): Promise<void>;
  removeFromTeam(projectId: string, userId: string): Promise<void>;
}
