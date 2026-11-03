import { vi } from "vitest";
import {
  ApiError,
  type Api,
  type GroupDto,
  type InviteDto,
  type MemberDto,
  type ProjectDto,
  type SessionDto,
  type TeamMemberDto,
} from "../api/api";
import type { AuthClient, AuthSession } from "../auth/AuthClient";

export function fakeAuth(initial: AuthSession | null = null) {
  let session = initial;
  const listeners = new Set<(s: AuthSession | null) => void>();
  const emit = () => listeners.forEach((l) => l(session));

  const client: AuthClient = {
    getSession: async () => session,
    signInWithGoogle: vi.fn(async () => {
      session = { credential: "cred", user: { id: "me", name: "Santi", email: "santi@correo.com" } };
      emit();
    }),
    signOut: vi.fn(async () => {
      session = null;
      emit();
    }),
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return client;
}

export const me: AuthSession = { credential: "cred", user: { id: "me", name: "Santi", email: "santi@correo.com" } };

/** An in-memory API that behaves like the real one for the flows under test. */
export function fakeApi(
  seed: {
    groups?: GroupDto[];
    members?: Record<string, MemberDto[]>;
    invites?: InviteDto[];
    projects?: ProjectDto[];
    team?: Record<string, TeamMemberDto[]>;
    sessions?: SessionDto[];
  } = {},
) {
  const state = {
    groups: [...(seed.groups ?? [])],
    members: { ...(seed.members ?? {}) },
    invites: [...(seed.invites ?? [])],
    // Copies: the API fake mutates projects, and the seeds are shared constants.
    projects: (seed.projects ?? []).map((p) => ({ ...p })),
    team: { ...(seed.team ?? {}) } as Record<string, TeamMemberDto[]>,
    sessions: (seed.sessions ?? []).map((s) => ({ ...s })),
  };
  let n = 0;

  /** Sessions of one numbering scope: a project, or the group-level ones. */
  const inScope = (groupId: string, projectId: string | null) =>
    state.sessions.filter((s) => s.groupId === groupId && (s.projectId ?? null) === projectId);
  const nextNumber = (groupId: string, projectId: string | null) =>
    Math.max(0, ...inScope(groupId, projectId).map((s) => s.number)) + 1;

  const api: Api = {
    start: vi.fn(async () => {
      if (state.groups.length === 0) return { destination: "none" } as const;
      if (state.groups.length === 1) return { destination: "group", group: state.groups[0]! } as const;
      return { destination: "choose", groups: state.groups } as const;
    }),
    myGroups: vi.fn(async () => state.groups),
    createGroup: vi.fn(async (input) => {
      const group: GroupDto = {
        id: `g${++n}`,
        handle: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: input.name,
        ...(input.city ? { city: input.city } : {}),
        createdAt: new Date().toISOString(),
      };
      state.groups.push(group);
      state.members[group.id] = [{ userId: "me", role: "admin", displayName: "Santi" }];
      return group;
    }),
    members: vi.fn(async (groupId) => state.members[groupId] ?? []),
    invites: vi.fn(async (groupId) => state.invites.filter((i) => i.groupId === groupId)),
    createInvite: vi.fn(async (groupId, input) => {
      const invite: InviteDto = {
        id: `i${++n}`,
        groupId,
        token: `token-${n}`,
        ...(input.label ? { label: input.label } : {}),
        createdBy: "me",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      };
      state.invites.push(invite);
      return invite;
    }),
    revokeInvite: vi.fn(async (inviteId) => {
      state.invites = state.invites.filter((i) => i.id !== inviteId);
    }),
    acceptInvite: vi.fn(async (token) => {
      const invite = state.invites.find((i) => i.token === token);
      const group = invite && state.groups.find((g) => g.id === invite.groupId);
      if (!group) throw new ApiError(410, "invite_invalid", "Este enlace ya no sirve. Pídele a un admin uno nuevo.");
      return group;
    }),
    projects: vi.fn(async (groupId) => state.projects.filter((p) => p.groupId === groupId)),
    project: vi.fn(async (groupId, slug) => {
      const project = state.projects.find((p) => p.groupId === groupId && p.slug === slug);
      if (!project) throw new ApiError(404, "not_found", "No encontramos esa obra");
      return project;
    }),
    createProject: vi.fn(async (groupId, input) => {
      const project: ProjectDto = {
        id: `p${++n}`,
        groupId,
        slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: input.title,
        status: input.status,
        themes: input.themes,
        ...(input.visibilityAgreement ? { visibilityAgreement: input.visibilityAgreement } : {}),
        createdAt: new Date().toISOString(),
      };
      state.projects.push(project);
      // Like the real API: an origin session joins the project and takes its next number.
      const origin = state.sessions.find((s) => s.id === input.originSessionId);
      if (origin) {
        origin.number = nextNumber(groupId, project.id);
        origin.projectId = project.id;
        project.originSessionId = origin.id;
      }
      return project;
    }),
    sessions: vi.fn(async (groupId, scope) => {
      const list =
        scope === undefined
          ? state.sessions.filter((s) => s.groupId === groupId)
          : inScope(groupId, scope === "none" ? null : scope.project);
      return [...list].sort((a, b) => a.number - b.number);
    }),
    session: vi.fn(async (groupId, number, projectSlug) => {
      const projectId = projectSlug
        ? (state.projects.find((p) => p.groupId === groupId && p.slug === projectSlug)?.id ?? "missing")
        : null;
      const found = inScope(groupId, projectId).find((s) => s.number === number);
      if (!found) throw new ApiError(404, "not_found", "No encontramos esa sesión");
      return found;
    }),
    createSession: vi.fn(async (groupId, input) => {
      const projectId = input.projectId ?? null;
      const session: SessionDto = {
        id: `s${++n}`,
        groupId,
        ...(projectId ? { projectId } : {}),
        number: nextNumber(groupId, projectId),
        ...(input.date ? { date: input.date } : {}),
        ...(input.place ? { place: input.place } : {}),
        ...(input.objective ? { objective: input.objective } : {}),
        status: "planned",
        createdBy: "me",
        createdAt: new Date().toISOString(),
      };
      state.sessions.push(session);
      return session;
    }),
    updateSession: vi.fn(async (sessionId, input) => {
      const session = state.sessions.find((s) => s.id === sessionId)!;
      Object.assign(session, input);
      return session;
    }),
    updateProject: vi.fn(async (projectId, input) => {
      const project = state.projects.find((p) => p.id === projectId)!;
      const { visibilityAgreement, ...rest } = input;
      Object.assign(project, rest);
      if (visibilityAgreement !== undefined) {
        if (visibilityAgreement) project.visibilityAgreement = visibilityAgreement;
        else delete project.visibilityAgreement;
      }
      return project;
    }),
    team: vi.fn(async (projectId) => state.team[projectId] ?? []),
    setRoles: vi.fn(async (projectId, userId, roles) => {
      const list = (state.team[projectId] ??= []);
      const existing = list.find((m) => m.userId === userId);
      if (existing) existing.roles = roles;
      else {
        const name = Object.values(state.members).flat().find((m) => m.userId === userId)?.displayName;
        list.push({ userId, roles, ...(name ? { displayName: name } : {}) });
      }
    }),
    removeFromTeam: vi.fn(async (projectId, userId) => {
      state.team[projectId] = (state.team[projectId] ?? []).filter((m) => m.userId !== userId);
    }),
  };
  return { api, state };
}

export const conversonantes: GroupDto = {
  id: "g-conv",
  handle: "conversonantes",
  name: "Conversonantes",
  city: "Medellín",
  createdAt: "2026-11-02T10:00:00Z",
};

export const cristina: ProjectDto = {
  id: "p-cristina",
  groupId: "g-conv",
  slug: "cristina",
  title: "Cristina",
  status: "staging",
  themes: ["memoria", "duelo"],
  visibilityAgreement: "Podemos mostrar fotos, no audios.",
  createdAt: "2026-11-02T10:00:00Z",
};

/** A group with an admin (me), two members and the project "Cristina" with a small team. */
export function seededProject(role: "admin" | "member" = "admin", extra: { sessions?: SessionDto[] } = {}) {
  return fakeApi({
    ...extra,
    groups: [conversonantes],
    members: {
      "g-conv": [
        { userId: "me", role, displayName: "Santi" },
        { userId: "manu", role: "member", displayName: "Manu" },
        { userId: "kokoro", role: "member", displayName: "Kokoro" },
      ],
    },
    projects: [cristina],
    team: {
      "p-cristina": [
        { userId: "me", roles: ["owner", "director"], displayName: "Santi" },
        { userId: "manu", roles: ["actor"], displayName: "Manu" },
      ],
    },
  });
}

/** Two sessions of the group (no project yet), as before Cristina existed. */
export const groupSessions: SessionDto[] = [
  {
    id: "s-1",
    groupId: "g-conv",
    number: 1,
    date: "2026-10-20",
    place: "Casa de Manu",
    objective: "Reencuentro",
    status: "planned",
    createdBy: "me",
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "s-2",
    groupId: "g-conv",
    number: 2,
    objective: "Explorar el texto",
    status: "planned",
    createdBy: "manu",
    createdAt: "2026-10-27T10:00:00Z",
  },
];

/** Project sessions of "Cristina": S01 completed (origin) and S02 planned. */
export const cristinaSessions: SessionDto[] = [
  {
    id: "c-1",
    groupId: "g-conv",
    projectId: "p-cristina",
    number: 1,
    date: "2026-10-20",
    objective: "Reencuentro",
    status: "completed",
    createdBy: "me",
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "c-2",
    groupId: "g-conv",
    projectId: "p-cristina",
    number: 2,
    date: "2026-11-10",
    place: "U. Nacional",
    objective: "Analizar el texto y seguir ahondando",
    status: "planned",
    createdBy: "me",
    createdAt: "2026-11-02T10:00:00Z",
  },
];
