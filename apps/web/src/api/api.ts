export interface GroupDto {
  id: string;
  handle: string;
  name: string;
  city?: string;
  createdAt: string;
}

export interface MemberDto {
  userId: string;
  role: "admin" | "member";
  displayName?: string;
}

export interface InviteDto {
  id: string;
  groupId: string;
  token: string;
  label?: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
}

export const PROJECT_STATUSES = ["searching", "staging", "running", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface SessionDto {
  id: string;
  groupId: string;
  projectId?: string;
  number: number;
  /** "YYYY-MM-DD"; absent when the date is still pending. */
  date?: string;
  place?: string;
  objective?: string;
  status: "planned" | "completed";
  createdBy: string;
  createdAt: string;
}

export interface SessionInput {
  projectId?: string;
  date?: string | null;
  place?: string;
  objective?: string;
}

/** Which sessions to list: a project's, the group-level ones ("none"), or all. */
export type SessionScopeDto = { project: string } | "none" | undefined;

export interface ApproachDto {
  id: string;
  sessionId: string;
  position: number;
  text: string;
  /** The group member who brings it ("¿quién lo trae?"). */
  ownerId: string;
  createdBy: string;
  createdAt: string;
}

/** HU-09: what is on my plate in a group. */
export interface HomeDto {
  /** Held sessions that still need their record. */
  toRecord: SessionDto[];
  /** Approaches I bring, in planned sessions. */
  mine: { approach: ApproachDto; session: SessionDto }[];
  /** Planned sessions, soonest first. */
  upcoming: { session: SessionDto; approachCount: number }[];
}

export interface ProjectDto {
  id: string;
  groupId: string;
  slug: string;
  title: string;
  status: ProjectStatus;
  themes: string[];
  visibilityAgreement?: string;
  originSessionId?: string;
  createdAt: string;
}

export interface ProjectInput {
  title: string;
  status: ProjectStatus;
  themes: string[];
  visibilityAgreement: string;
  /** A group session this project is born from (HU-05). */
  originSessionId?: string;
}

export interface TeamMemberDto {
  userId: string;
  roles: string[];
  displayName?: string;
}

export type StartDto =
  | { destination: "group"; group: GroupDto }
  | { destination: "choose"; groups: GroupDto[] }
  | { destination: "none" };

/** An error answered by the API; `message` is already in Spanish and fit for the screen. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Api {
  start(lastGroupId?: string): Promise<StartDto>;
  myGroups(): Promise<GroupDto[]>;
  createGroup(input: { name: string; city?: string }): Promise<GroupDto>;
  members(groupId: string): Promise<MemberDto[]>;
  invites(groupId: string): Promise<InviteDto[]>;
  createInvite(groupId: string, input: { label?: string }): Promise<InviteDto>;
  revokeInvite(inviteId: string): Promise<void>;
  acceptInvite(token: string): Promise<GroupDto>;
  home(groupId: string): Promise<HomeDto>;
  projects(groupId: string): Promise<ProjectDto[]>;
  project(groupId: string, slug: string): Promise<ProjectDto>;
  createProject(groupId: string, input: ProjectInput): Promise<ProjectDto>;
  sessions(groupId: string, scope?: SessionScopeDto): Promise<SessionDto[]>;
  /** A session by its address; `projectSlug` omitted means a group-level session. */
  session(groupId: string, number: number, projectSlug?: string): Promise<SessionDto>;
  createSession(groupId: string, input: SessionInput): Promise<SessionDto>;
  updateSession(sessionId: string, input: Partial<Omit<SessionInput, "projectId">>): Promise<SessionDto>;
  approaches(sessionId: string): Promise<ApproachDto[]>;
  addApproach(sessionId: string, input: { text: string; ownerId: string }): Promise<ApproachDto>;
  updateApproach(approachId: string, input: { text?: string; ownerId?: string }): Promise<ApproachDto>;
  removeApproach(approachId: string): Promise<void>;
  /** Sends the full new order; answers with the list as the server now has it. */
  reorderApproaches(sessionId: string, orderedIds: string[]): Promise<ApproachDto[]>;
  updateProject(projectId: string, input: Partial<ProjectInput>): Promise<ProjectDto>;
  team(projectId: string): Promise<TeamMemberDto[]>;
  setRoles(projectId: string, userId: string, roles: string[]): Promise<void>;
  removeFromTeam(projectId: string, userId: string): Promise<void>;
}

/** HTTP implementation. `credential()` is awaited per request so refreshed tokens are used. */
export function createHttpApi(credential: () => Promise<string | null>, baseUrl = "/api"): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await credential();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data ?? {}) as { error?: string; message?: string };
      throw new ApiError(res.status, e.error ?? "error", e.message ?? "Algo salió mal. Intenta de nuevo.");
    }
    return data as T;
  }

  return {
    start: (last) => request("GET", `/me/start${last ? `?last=${encodeURIComponent(last)}` : ""}`),
    myGroups: () => request("GET", "/me/groups"),
    createGroup: (input) => request("POST", "/groups", input),
    members: (groupId) => request("GET", `/groups/${groupId}/members`),
    invites: (groupId) => request("GET", `/groups/${groupId}/invites`),
    createInvite: (groupId, input) => request("POST", `/groups/${groupId}/invites`, input),
    revokeInvite: (inviteId) => request("DELETE", `/invites/${inviteId}`),
    acceptInvite: (token) => request("POST", "/invites/accept", { token }),
    home: (groupId) => request("GET", `/groups/${groupId}/home`),
    projects: (groupId) => request("GET", `/groups/${groupId}/projects`),
    project: (groupId, slug) => request("GET", `/groups/${groupId}/projects/${encodeURIComponent(slug)}`),
    createProject: (groupId, input) => request("POST", `/groups/${groupId}/projects`, input),
    sessions: (groupId, scope) => {
      const filter = scope === undefined ? "" : `?project=${scope === "none" ? "none" : scope.project}`;
      return request("GET", `/groups/${groupId}/sessions${filter}`);
    },
    session: (groupId, number, projectSlug) =>
      request("GET", `/groups/${groupId}/sessions/${number}${projectSlug ? `?project=${encodeURIComponent(projectSlug)}` : ""}`),
    createSession: (groupId, input) => request("POST", `/groups/${groupId}/sessions`, input),
    updateSession: (sessionId, input) => request("PATCH", `/sessions/${sessionId}`, input),
    approaches: (sessionId) => request("GET", `/sessions/${sessionId}/approaches`),
    addApproach: (sessionId, input) => request("POST", `/sessions/${sessionId}/approaches`, input),
    updateApproach: (approachId, input) => request("PATCH", `/approaches/${approachId}`, input),
    removeApproach: (approachId) => request("DELETE", `/approaches/${approachId}`),
    reorderApproaches: (sessionId, orderedIds) =>
      request("PUT", `/sessions/${sessionId}/approaches/order`, { ids: orderedIds }),
    updateProject: (projectId, input) => request("PATCH", `/projects/${projectId}`, input),
    team: (projectId) => request("GET", `/projects/${projectId}/team`),
    setRoles: (projectId, userId, roles) => request("PUT", `/projects/${projectId}/team/${userId}`, { roles }),
    removeFromTeam: (projectId, userId) => request("DELETE", `/projects/${projectId}/team/${userId}`),
  };
}
