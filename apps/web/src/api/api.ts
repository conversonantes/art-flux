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
  };
}
