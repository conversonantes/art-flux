import { ForbiddenError, NotFoundError } from "../errors";
import type { Clock, GroupsRepo } from "../groups";
import { slugBase, slugCandidate } from "../slug";
import {
  PROJECT_SLUG_MAX,
  PROJECT_SLUG_MIN,
  RESERVED_PROJECT_SLUGS,
  createProjectSchema,
  rolesSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type Project,
  type TeamMember,
  type UpdateProjectInput,
} from "./project";
import { SlugTakenError, type ProjectsRepo } from "./repo";

export interface ProjectDeps {
  groups: GroupsRepo;
  projects: ProjectsRepo;
  clock: Clock;
}

const MAX_ATTEMPTS = 50;

async function requireMember(deps: ProjectDeps, groupId: string, userId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(groupId, userId)) === null) throw new NotFoundError();
}

async function requireAdmin(deps: ProjectDeps, groupId: string, userId: string): Promise<void> {
  const role = await deps.groups.getMemberRole(groupId, userId);
  if (role === null) throw new NotFoundError();
  if (role !== "admin") throw new ForbiddenError();
}

async function projectOrNotFound(deps: ProjectDeps, projectId: string): Promise<Project> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new NotFoundError("No encontramos esa obra");
  return project;
}

/** HU-05: an admin creates a project (obra). Its slug comes from the title and is unique in the group. */
export async function createProject(
  deps: ProjectDeps,
  input: { id: string; groupId: string; userId: string } & CreateProjectInput,
): Promise<Project> {
  const { id, groupId, userId, ...data } = input;
  await requireAdmin(deps, groupId, userId);
  const { title, status, themes, visibilityAgreement } = createProjectSchema.parse(data);
  const base = slugBase(title, { fallback: "project", min: PROJECT_SLUG_MIN, max: PROJECT_SLUG_MAX });
  const naming = { max: PROJECT_SLUG_MAX, reserved: RESERVED_PROJECT_SLUGS };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const slug = slugCandidate(base, attempt, naming);
    if (await deps.projects.slugExists(groupId, slug)) continue;

    const project: Project = {
      id,
      groupId,
      slug,
      title,
      status,
      themes,
      ...(visibilityAgreement ? { visibilityAgreement } : {}),
      createdAt: deps.clock.now(),
    };
    try {
      await deps.projects.create(project);
      return project;
    } catch (e) {
      if (e instanceof SlugTakenError) continue; // race: try the next one
      throw e;
    }
  }
  throw new Error("No se pudo generar una dirección única para la obra");
}

/** HU-05: edit everything later. The slug never changes, so shared links keep working. */
export async function updateProject(
  deps: ProjectDeps,
  input: { projectId: string; userId: string; changes: UpdateProjectInput },
): Promise<Project> {
  const project = await projectOrNotFound(deps, input.projectId);
  await requireAdmin(deps, project.groupId, input.userId);
  const patch = updateProjectSchema.parse(input.changes);
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return deps.projects.update(project.id, clean);
}

export async function getProject(
  deps: ProjectDeps,
  input: { groupId: string; slug: string; userId: string },
): Promise<Project> {
  await requireMember(deps, input.groupId, input.userId);
  const project = await deps.projects.getBySlug(input.groupId, input.slug);
  if (!project) throw new NotFoundError("No encontramos esa obra");
  return project;
}

export async function listProjects(
  deps: ProjectDeps,
  input: { groupId: string; userId: string },
): Promise<Project[]> {
  await requireMember(deps, input.groupId, input.userId);
  return deps.projects.listByGroup(input.groupId);
}

export async function listTeam(
  deps: ProjectDeps,
  input: { projectId: string; userId: string },
): Promise<TeamMember[]> {
  const project = await projectOrNotFound(deps, input.projectId);
  await requireMember(deps, project.groupId, input.userId);
  return deps.projects.listTeam(project.id);
}

/**
 * HU-06: an admin adds a group member to the team or changes their roles.
 * Roles are artistic labels only: they never change what anyone can do in the app.
 */
export async function setTeamRoles(
  deps: ProjectDeps,
  input: { projectId: string; userId: string; memberId: string; roles: string[] },
): Promise<void> {
  const project = await projectOrNotFound(deps, input.projectId);
  await requireAdmin(deps, project.groupId, input.userId);
  const roles = rolesSchema.parse(input.roles);
  if ((await deps.groups.getMemberRole(project.groupId, input.memberId)) === null) {
    throw new ForbiddenError("Solo puedes agregar a personas del grupo");
  }
  await deps.projects.setRoles(project.id, input.memberId, roles);
}

export async function removeFromTeam(
  deps: ProjectDeps,
  input: { projectId: string; userId: string; memberId: string },
): Promise<void> {
  const project = await projectOrNotFound(deps, input.projectId);
  await requireAdmin(deps, project.groupId, input.userId);
  await deps.projects.removeFromTeam(project.id, input.memberId);
}
