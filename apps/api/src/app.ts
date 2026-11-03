import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  HandleTakenError,
  InviteInvalidError,
  NotFoundError,
  acceptInvite,
  addApproach,
  createGroup,
  createInvite,
  createProjectWithOrigin,
  createSession,
  getMediaUrl,
  getMyHome,
  getProject,
  getSession,
  listApproaches,
  listFragments,
  listAttendees,
  listMedia,
  listInvites,
  listMembers,
  listMyGroups,
  listProjects,
  listSessions,
  listTeam,
  confirmUpload,
  markCompleted,
  registerMedia,
  removeMedia,
  removeApproach,
  removeFragment,
  removeFromTeam,
  reorderApproaches,
  resolveInitialGroup,
  saveFragment,
  revokeInvite,
  setApproachNote,
  setTeamRoles,
  updateApproach,
  updateAttendees,
  updateProject,
  updateSession,
  type AppDeps,
  type Authenticator,
  type CreateProjectInput,
  type RegisterMediaInput,
  type AuthSession,
  type UpdateProjectInput,
  type UpdateSessionInput,
} from "@art-flux/core";

export interface AppOptions {
  /** Validates the bearer credential and returns the session, or null if it is not valid. */
  authenticator: Authenticator;
  /** Repositories acting as this session's user. How they authorize is the adapter's business. */
  depsFor(session: AuthSession): AppDeps;
}

type Env = { Variables: { session: AuthSession; deps: AppDeps } };

const uuid = z.uuid("Identificador no válido");

async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HTTPException(400, { message: "El cuerpo debe ser un objeto JSON" });
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function createApp(options: AppOptions) {
  const app = new Hono<Env>();

  app.get("/health", (c) => c.json({ ok: true }));

  // Every other route needs a valid session.
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const header = c.req.header("Authorization") ?? "";
    const credential = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const session = credential ? await options.authenticator.authenticate(credential) : null;
    if (!session) return c.json({ error: "unauthorized", message: "Inicia sesión para continuar" }, 401);
    c.set("session", session);
    c.set("deps", options.depsFor(session));
    return next();
  });

  // Where to send the user after login (HU-02): their group, a selector, or "create one".
  app.get("/me/start", async (c) => {
    const last = c.req.query("last");
    const result = await resolveInitialGroup(c.get("deps"), c.get("session").userId, last || undefined);
    return c.json(result);
  });

  app.get("/me/groups", async (c) =>
    c.json(await listMyGroups(c.get("deps"), c.get("session").userId)),
  );

  app.post("/groups", async (c) => {
    const body = await jsonBody(c.req.raw);
    const id = body.id === undefined ? randomUUID() : uuid.parse(body.id);
    const group = await createGroup(c.get("deps"), {
      id,
      userId: c.get("session").userId,
      name: str(body.name) ?? "",
      ...(str(body.city) !== undefined ? { city: str(body.city)! } : {}),
    });
    return c.json(group, 201);
  });

  app.get("/groups/:groupId/members", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    return c.json(await listMembers(c.get("deps"), { groupId, userId: c.get("session").userId }));
  });

  app.get("/groups/:groupId/invites", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    return c.json(await listInvites(c.get("deps"), { groupId, userId: c.get("session").userId }));
  });

  app.post("/groups/:groupId/invites", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const body = await jsonBody(c.req.raw);
    const id = body.id === undefined ? randomUUID() : uuid.parse(body.id);
    const label = str(body.label);
    const invite = await createInvite(c.get("deps"), {
      id,
      groupId,
      userId: c.get("session").userId,
      ...(label !== undefined ? { label } : {}),
    });
    return c.json(invite, 201);
  });

  app.delete("/invites/:inviteId", async (c) => {
    const inviteId = uuid.parse(c.req.param("inviteId"));
    await revokeInvite(c.get("deps"), { inviteId, userId: c.get("session").userId });
    return c.body(null, 204);
  });

  app.post("/invites/accept", async (c) => {
    const body = await jsonBody(c.req.raw);
    const token = str(body.token)?.trim();
    if (!token) throw new HTTPException(400, { message: "Falta el enlace de invitación" });
    const group = await acceptInvite(c.get("deps"), { token, userId: c.get("session").userId });
    return c.json(group);
  });

  // Home (HU-09): what is on my plate in this group.
  app.get("/groups/:groupId/home", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    return c.json(await getMyHome(c.get("deps"), { groupId, userId: c.get("session").userId }));
  });

  // Projects (HU-05) ----------------------------------------------------------------------
  app.get("/groups/:groupId/projects", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    return c.json(await listProjects(c.get("deps"), { groupId, userId: c.get("session").userId }));
  });

  app.post("/groups/:groupId/projects", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const { id: rawId, originSessionId, ...fields } = await jsonBody(c.req.raw);
    const { project } = await createProjectWithOrigin(c.get("deps"), {
      id: rawId === undefined ? randomUUID() : uuid.parse(rawId),
      groupId,
      userId: c.get("session").userId,
      title: str(fields.title) ?? "",
      ...(fields as Omit<CreateProjectInput, "title">),
      ...(originSessionId === undefined ? {} : { originSessionId: uuid.parse(originSessionId) }),
    });
    return c.json(project, 201);
  });

  app.get("/groups/:groupId/projects/:slug", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const slug = c.req.param("slug");
    return c.json(await getProject(c.get("deps"), { groupId, slug, userId: c.get("session").userId }));
  });

  app.patch("/projects/:projectId", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    const changes = (await jsonBody(c.req.raw)) as UpdateProjectInput;
    return c.json(await updateProject(c.get("deps"), { projectId, userId: c.get("session").userId, changes }));
  });

  // Sessions (HU-07) -----------------------------------------------------------------------
  // ?project=none lists group-level sessions, ?project=<uuid> one project's; no filter lists all.
  app.get("/groups/:groupId/sessions", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const filter = c.req.query("project");
    const projectId = filter === undefined ? undefined : filter === "none" ? null : uuid.parse(filter);
    return c.json(
      await listSessions(c.get("deps"), {
        groupId,
        userId: c.get("session").userId,
        ...(projectId === undefined ? {} : { projectId }),
      }),
    );
  });

  app.post("/groups/:groupId/sessions", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const { id: rawId, projectId, ...fields } = await jsonBody(c.req.raw);
    const session = await createSession(c.get("deps"), {
      id: rawId === undefined ? randomUUID() : uuid.parse(rawId),
      groupId,
      userId: c.get("session").userId,
      ...(projectId === undefined || projectId === null ? {} : { projectId: uuid.parse(projectId) }),
      ...(fields as { date?: string | null; place?: string | null; objective?: string | null }),
    });
    return c.json(session, 201);
  });

  // A session by its address: /groups/:id/sessions/2 (group S02) or ...?project=<slug> (project S02).
  app.get("/groups/:groupId/sessions/:number", async (c) => {
    const groupId = uuid.parse(c.req.param("groupId"));
    const number = z.coerce.number().int().positive("Número de sesión no válido").parse(c.req.param("number"));
    const projectSlug = c.req.query("project");
    return c.json(
      await getSession(c.get("deps"), {
        groupId,
        number,
        userId: c.get("session").userId,
        projectSlug,
      }),
    );
  });

  app.patch("/sessions/:sessionId", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    const changes = (await jsonBody(c.req.raw)) as UpdateSessionInput;
    return c.json(await updateSession(c.get("deps"), { sessionId, userId: c.get("session").userId, changes }));
  });

  // Held sessions (HU-11) ------------------------------------------------------------------
  app.post("/sessions/:sessionId/complete", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    const body = await jsonBody(c.req.raw);
    const attendeeIds = z.array(uuid).parse(body.attendeeIds);
    return c.json(await markCompleted(c.get("deps"), { sessionId, userId: c.get("session").userId, attendeeIds }));
  });

  app.get("/sessions/:sessionId/attendees", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    return c.json(await listAttendees(c.get("deps"), { sessionId, userId: c.get("session").userId }));
  });

  app.put("/sessions/:sessionId/attendees", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    const body = await jsonBody(c.req.raw);
    const attendeeIds = z.array(uuid).parse(body.attendeeIds);
    return c.json(await updateAttendees(c.get("deps"), { sessionId, userId: c.get("session").userId, attendeeIds }));
  });

  // Approaches (HU-08) ---------------------------------------------------------------------
  app.get("/sessions/:sessionId/approaches", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    return c.json(await listApproaches(c.get("deps"), { sessionId, userId: c.get("session").userId }));
  });

  app.post("/sessions/:sessionId/approaches", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    const body = await jsonBody(c.req.raw);
    const approach = await addApproach(c.get("deps"), {
      id: body.id === undefined ? randomUUID() : uuid.parse(body.id),
      sessionId,
      userId: c.get("session").userId,
      text: str(body.text) ?? "",
      ...(body.ownerId === undefined ? {} : { ownerId: uuid.parse(body.ownerId) }),
    });
    return c.json(approach, 201);
  });

  // The whole new order, by id. 409 if the list changed meanwhile: reload and try again.
  app.put("/sessions/:sessionId/approaches/order", async (c) => {
    const sessionId = uuid.parse(c.req.param("sessionId"));
    const body = await jsonBody(c.req.raw);
    const orderedIds = z.array(uuid).parse(body.ids);
    return c.json(await reorderApproaches(c.get("deps"), { sessionId, userId: c.get("session").userId, orderedIds }));
  });

  app.patch("/approaches/:approachId", async (c) => {
    const approachId = uuid.parse(c.req.param("approachId"));
    const body = await jsonBody(c.req.raw);
    return c.json(
      await updateApproach(c.get("deps"), {
        approachId,
        userId: c.get("session").userId,
        changes: {
          ...(body.text === undefined ? {} : { text: str(body.text) ?? "" }),
          ...(body.ownerId === undefined ? {} : { ownerId: uuid.parse(body.ownerId) }),
        },
      }),
    );
  });

  // The owner's note "cómo lo planteo"; null or empty text clears it.
  app.put("/approaches/:approachId/note", async (c) => {
    const approachId = uuid.parse(c.req.param("approachId"));
    const body = await jsonBody(c.req.raw);
    const note = body.note === null || body.note === undefined ? null : (str(body.note) ?? "");
    return c.json(await setApproachNote(c.get("deps"), { approachId, userId: c.get("session").userId, note }));
  });

  app.delete("/approaches/:approachId", async (c) => {
    const approachId = uuid.parse(c.req.param("approachId"));
    await removeApproach(c.get("deps"), { approachId, userId: c.get("session").userId });
    return c.body(null, 204);
  });

  // Findings (HU-12) -----------------------------------------------------------------------
  app.get("/approaches/:approachId/findings", async (c) => {
    const approachId = uuid.parse(c.req.param("approachId"));
    return c.json(await listFragments(c.get("deps"), { approachId, userId: c.get("session").userId }));
  });

  // Creates the fragment, or edits its text if that id already exists (autosave and retries).
  app.put("/findings/:fragmentId", async (c) => {
    const id = uuid.parse(c.req.param("fragmentId"));
    const body = await jsonBody(c.req.raw);
    return c.json(
      await saveFragment(c.get("deps"), {
        id,
        approachId: uuid.parse(body.approachId),
        userId: c.get("session").userId,
        kind: str(body.kind) ?? "",
        text: str(body.text) ?? "",
      }),
    );
  });

  app.delete("/findings/:fragmentId", async (c) => {
    const fragmentId = uuid.parse(c.req.param("fragmentId"));
    await removeFragment(c.get("deps"), { fragmentId, userId: c.get("session").userId });
    return c.body(null, 204);
  });

  // Material (HU-13) ----------------------------------------------------------------------
  // Registers material in an obra. Files answer with where to upload them; links and notes are done.
  app.post("/projects/:projectId/media", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    const { id, sessionId, approachId, ...material } = await jsonBody(c.req.raw);
    const result = await registerMedia(c.get("deps"), {
      id: id === undefined ? randomUUID() : uuid.parse(id),
      projectId,
      userId: c.get("session").userId,
      ...(sessionId == null ? {} : { sessionId: uuid.parse(sessionId) }),
      ...(approachId == null ? {} : { approachId: uuid.parse(approachId) }),
      material: material as RegisterMediaInput,
    });
    return c.json(result, 201);
  });

  // The phone says the file reached the store; the core checks it is really there.
  app.post("/media/:mediaId/confirm", async (c) => {
    const mediaId = uuid.parse(c.req.param("mediaId"));
    return c.json(await confirmUpload(c.get("deps"), { mediaId, userId: c.get("session").userId }));
  });

  // ?session=<id> or ?approach=<id> narrow it; with neither, everything of the obra.
  app.get("/projects/:projectId/media", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    const session = c.req.query("session");
    const approach = c.req.query("approach");
    return c.json(
      await listMedia(c.get("deps"), {
        projectId,
        userId: c.get("session").userId,
        ...(session ? { sessionId: uuid.parse(session) } : {}),
        ...(approach ? { approachId: uuid.parse(approach) } : {}),
      }),
    );
  });

  // A short-lived address to open it (signed for files).
  app.get("/media/:mediaId/url", async (c) => {
    const mediaId = uuid.parse(c.req.param("mediaId"));
    return c.json(await getMediaUrl(c.get("deps"), { mediaId, userId: c.get("session").userId }));
  });

  app.delete("/media/:mediaId", async (c) => {
    const mediaId = uuid.parse(c.req.param("mediaId"));
    await removeMedia(c.get("deps"), { mediaId, userId: c.get("session").userId });
    return c.body(null, 204);
  });

  // Team (HU-06) ---------------------------------------------------------------------------
  app.get("/projects/:projectId/team", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    return c.json(await listTeam(c.get("deps"), { projectId, userId: c.get("session").userId }));
  });

  app.put("/projects/:projectId/team/:memberId", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    const memberId = uuid.parse(c.req.param("memberId"));
    const body = await jsonBody(c.req.raw);
    await setTeamRoles(c.get("deps"), {
      projectId,
      memberId,
      userId: c.get("session").userId,
      roles: body.roles as string[],
    });
    return c.body(null, 204);
  });

  app.delete("/projects/:projectId/team/:memberId", async (c) => {
    const projectId = uuid.parse(c.req.param("projectId"));
    const memberId = uuid.parse(c.req.param("memberId"));
    await removeFromTeam(c.get("deps"), { projectId, memberId, userId: c.get("session").userId });
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "not_found", message: "No existe esa ruta" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: "bad_request", message: err.message }, err.status);
    }
    if (Array.isArray((err as { issues?: unknown }).issues)) {
      const issue = (err as z.ZodError).issues[0];
      return c.json({ error: "validation", message: issue?.message ?? "Datos no válidos" }, 400);
    }
    if (err instanceof NotFoundError) return c.json({ error: "not_found", message: err.message }, 404);
    if (err instanceof ConflictError) return c.json({ error: "conflict", message: err.message }, 409);
    if (err instanceof ForbiddenError) return c.json({ error: "forbidden", message: err.message }, 403);
    if (err instanceof InviteInvalidError) return c.json({ error: "invite_invalid", message: err.message }, 410);
    if (err instanceof HandleTakenError) return c.json({ error: "handle_taken", message: err.message }, 409);
    console.error(err);
    return c.json({ error: "internal", message: "Algo salió mal. Intenta de nuevo." }, 500);
  });

  return app;
}
