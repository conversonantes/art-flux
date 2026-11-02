import { vi } from "vitest";
import { ApiError, type Api, type GroupDto, type InviteDto, type MemberDto } from "../api/api";
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
export function fakeApi(seed: { groups?: GroupDto[]; members?: Record<string, MemberDto[]>; invites?: InviteDto[] } = {}) {
  const state = {
    groups: [...(seed.groups ?? [])],
    members: { ...(seed.members ?? {}) },
    invites: [...(seed.invites ?? [])],
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
