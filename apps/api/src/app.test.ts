// Offline route tests: fake auth + in-memory repos from the core.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryGroupsRepo, InMemoryInvitesRepo, randomTokenGenerator } from "@art-flux/core";
import { createApp } from "./app";

function setup() {
  const groups = new InMemoryGroupsRepo();
  const invites = new InMemoryInvitesRepo(groups);
  const clock = { now: () => new Date() };
  const deps = { groups, invites, clock, tokens: randomTokenGenerator };
  const sessions: Record<string, string> = { "tok-owner": "owner", "tok-ana": "ana", "tok-luis": "luis" };
  const app = createApp({
    authenticate: async (t) => (sessions[t] ? { id: sessions[t]! } : null),
    depsFor: () => deps,
  });
  const call = (token: string | null, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return { call };
}

describe("auth", () => {
  it("serves /health without a session", async () => {
    const { call } = setup();
    expect((await call(null, "GET", "/health")).status).toBe(200);
  });

  it("rejects missing, malformed and unknown tokens with 401", async () => {
    const { call } = setup();
    for (const token of [null, "", "tok-nadie"]) {
      const res = await call(token, "GET", "/me/start");
      expect(res.status).toBe(401);
    }
  });
});

describe("groups", () => {
  it("tells a new user to create a group, then goes straight to it", async () => {
    const { call } = setup();
    expect(await (await call("tok-owner", "GET", "/me/start")).json()).toEqual({ destination: "none" });

    const res = await call("tok-owner", "POST", "/groups", { name: "Conversonantes", city: "Medellín" });
    expect(res.status).toBe(201);
    const group = await res.json();
    expect(group).toMatchObject({ name: "Conversonantes", handle: "conversonantes", city: "Medellín" });

    const start = await (await call("tok-owner", "GET", "/me/start")).json();
    expect(start).toMatchObject({ destination: "group", group: { id: group.id } });
  });

  it("returns 400 with a Spanish message when the name is missing", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "POST", "/groups", { name: "  " });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("El grupo necesita un nombre");
  });

  it("returns 400 for a body that is not a JSON object", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "POST", "/groups", [1, 2]);
    expect(res.status).toBe(400);
  });
});

describe("invitations", () => {
  async function withGroup() {
    const s = setup();
    const group = await (await s.call("tok-owner", "POST", "/groups", { name: "Grupo" })).json();
    return { ...s, group };
  }

  it("full flow over HTTP: create, accept, single use, list, revoke", async () => {
    const { call, group } = await withGroup();

    const created = await call("tok-owner", "POST", `/groups/${group.id}/invites`, { label: "para Ana" });
    expect(created.status).toBe(201);
    const invite = await created.json();
    expect(invite.token).toHaveLength(43);

    const accepted = await call("tok-ana", "POST", "/invites/accept", { token: invite.token });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).id).toBe(group.id);

    const second = await call("tok-luis", "POST", "/invites/accept", { token: invite.token });
    expect(second.status).toBe(410);
    expect((await second.json()).error).toBe("invite_invalid");

    const list = await (await call("tok-owner", "GET", `/groups/${group.id}/invites`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: "para Ana", acceptedBy: "ana" });

    expect((await call("tok-owner", "DELETE", `/invites/${invite.id}`)).status).toBe(204);
    expect((await call("tok-owner", "DELETE", `/invites/${invite.id}`)).status).toBe(204);
  });

  it("only admins can create, list or revoke (403)", async () => {
    const { call, group } = await withGroup();
    const invite = await (await call("tok-owner", "POST", `/groups/${group.id}/invites`, {})).json();
    await call("tok-ana", "POST", "/invites/accept", { token: invite.token });

    expect((await call("tok-ana", "POST", `/groups/${group.id}/invites`, {})).status).toBe(403);
    expect((await call("tok-ana", "GET", `/groups/${group.id}/invites`)).status).toBe(403);
    expect((await call("tok-ana", "DELETE", `/invites/${invite.id}`)).status).toBe(403);
    expect((await call("tok-luis", "GET", `/groups/${group.id}/invites`)).status).toBe(403);
  });

  it("validates ids and the token in the body", async () => {
    const { call, group } = await withGroup();
    expect((await call("tok-owner", "GET", "/groups/no-es-uuid/invites")).status).toBe(400);
    expect((await call("tok-owner", "DELETE", "/invites/no-es-uuid")).status).toBe(400);
    expect((await call("tok-owner", "POST", `/groups/${group.id}/invites`, { id: "x" })).status).toBe(400);
    expect((await call("tok-ana", "POST", "/invites/accept", {})).status).toBe(400);
  });

  it("answers 410 for an unknown link, and 403 when revoking an unknown id", async () => {
    const { call } = await withGroup();
    expect((await call("tok-ana", "POST", "/invites/accept", { token: "nope" })).status).toBe(410);
    expect((await call("tok-owner", "DELETE", `/invites/${randomUUID()}`)).status).toBe(403);
  });
});

describe("misc", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const { call } = setup();
    const res = await call("tok-owner", "GET", "/nada");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
