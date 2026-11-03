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
  /** "Cómo lo planteo": written by the owner, read by the whole group. */
  note?: string;
  createdAt: string;
}

export const MEDIA_KINDS = ["photo", "audio", "document", "link", "note"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Material of an obra (HU-13): a file in R2, a link or a written note. */
export interface MediaDto {
  id: string;
  groupId: string;
  projectId: string;
  sessionId?: string;
  approachId?: string;
  kind: MediaKind;
  title?: string;
  mime?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  url?: string;
  body?: string;
  /** A file is "pending" until its upload is confirmed. */
  status: "pending" | "uploaded";
  createdBy: string;
  createdAt: string;
}

/** What to send to register material; files carry their size and type, the bytes go to `upload`. */
export interface MediaInput {
  id: string;
  kind: MediaKind;
  title?: string;
  mime?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  url?: string;
  body?: string;
  sessionId?: string;
  approachId?: string;
}

/** Where the phone uploads a file (signed by the API; the bytes never pass through it). */
export interface UploadDto {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

/** One person's contribution to the finding of an approach (HU-12). */
export interface FindingFragmentDto {
  id: string;
  approachId: string;
  authorId: string;
  /** "found": Qué encontramos; "missing": Qué faltó. */
  kind: "found" | "missing";
  /** Plain text with **bold**, ==highlight== and "- " list marks. */
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** HU-09: what is on my plate in a group. */
export interface HomeDto {
  /** Held sessions with approaches still without a finding, with the progress. */
  toRecord: { session: SessionDto; total: number; done: number; pendingOwnerIds: string[] }[];
  /** Approaches I bring: those of planned sessions and the held ones still without a finding. */
  mine: { approach: ApproachDto; session: SessionDto; /** The "P3" of its address. */ order: number }[];
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
  registerMedia(projectId: string, input: MediaInput): Promise<{ media: MediaDto; upload?: UploadDto }>;
  confirmMedia(mediaId: string): Promise<MediaDto>;
  /** An obra's material, or only a session's or an approach's. */
  projectMedia(projectId: string, scope?: { sessionId?: string; approachId?: string }): Promise<MediaDto[]>;
  mediaUrl(mediaId: string): Promise<{ url: string; expiresAt?: string }>;
  removeMedia(mediaId: string): Promise<void>;
  /** Sends the file straight to the store with the signed address; `onProgress` gets 0..1. */
  uploadFile(upload: UploadDto, file: Blob, onProgress: (fraction: number) => void): Promise<void>;
  findings(approachId: string): Promise<FindingFragmentDto[]>;
  /** Creates the fragment or, if the id exists, edits its text (autosave, retries). Only its author may. */
  saveFinding(fragmentId: string, input: { approachId: string; kind: FindingFragmentDto["kind"]; text: string }): Promise<FindingFragmentDto>;
  removeFinding(fragmentId: string): Promise<void>;
  /** HU-11: planned → held, with who attended (user ids). */
  completeSession(sessionId: string, attendeeIds: string[]): Promise<SessionDto>;
  attendees(sessionId: string): Promise<string[]>;
  setAttendees(sessionId: string, attendeeIds: string[]): Promise<string[]>;
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
  /** The owner's note; null (or empty text) clears it. */
  setApproachNote(approachId: string, note: string | null): Promise<ApproachDto>;
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
    registerMedia: (projectId, input) => request("POST", `/projects/${projectId}/media`, input),
    confirmMedia: (mediaId) => request("POST", `/media/${mediaId}/confirm`),
    projectMedia: (projectId, scope) => {
      const params = new URLSearchParams();
      if (scope?.sessionId) params.set("session", scope.sessionId);
      if (scope?.approachId) params.set("approach", scope.approachId);
      const query = params.size ? `?${params}` : "";
      return request("GET", `/projects/${projectId}/media${query}`);
    },
    mediaUrl: (mediaId) => request("GET", `/media/${mediaId}/url`),
    removeMedia: (mediaId) => request("DELETE", `/media/${mediaId}`),
    uploadFile: (upload, file, onProgress) =>
      // XMLHttpRequest, because fetch cannot report how much of an upload has gone out.
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(upload.method, upload.url);
        for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("No se pudo subir el archivo. Intenta de nuevo.")));
        xhr.onerror = () => reject(new Error("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo."));
        xhr.send(file);
      }),
    findings: (approachId) => request("GET", `/approaches/${approachId}/findings`),
    saveFinding: (fragmentId, input) => request("PUT", `/findings/${fragmentId}`, input),
    removeFinding: (fragmentId) => request("DELETE", `/findings/${fragmentId}`),
    completeSession: (sessionId, attendeeIds) => request("POST", `/sessions/${sessionId}/complete`, { attendeeIds }),
    attendees: (sessionId) => request("GET", `/sessions/${sessionId}/attendees`),
    setAttendees: (sessionId, attendeeIds) => request("PUT", `/sessions/${sessionId}/attendees`, { attendeeIds }),
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
    setApproachNote: (approachId, note) => request("PUT", `/approaches/${approachId}/note`, { note }),
    reorderApproaches: (sessionId, orderedIds) =>
      request("PUT", `/sessions/${sessionId}/approaches/order`, { ids: orderedIds }),
    updateProject: (projectId, input) => request("PATCH", `/projects/${projectId}`, input),
    team: (projectId) => request("GET", `/projects/${projectId}/team`),
    setRoles: (projectId, userId, roles) => request("PUT", `/projects/${projectId}/team/${userId}`, { roles }),
    removeFromTeam: (projectId, userId) => request("DELETE", `/projects/${projectId}/team/${userId}`),
  };
}
