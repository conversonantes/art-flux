import { vi } from "vitest";
import {
  ApiError,
  type Api,
  type GroupDto,
  type InviteDto,
  type MemberDto,
  type ProjectDto,
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
  } = {},
) {
  const state = {
    groups: [...(seed.groups ?? [])],
    members: { ...(seed.members ?? {}) },
    invites: [...(seed.invites ?? [])],
    // Copies: the API fake mutates projects, and the seeds are shared constants.
    projects: (seed.projects ?? []).map((p) => ({ ...p })),
    team: { ...(seed.team ?? {}) } as Record<string, TeamMemberDto[]>,
  };
  let n = 0;

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
      return project;
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
export function seededProject(role: "admin" | "member" = "admin") {
  return fakeApi({
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
