import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  ForbiddenError,
  HandleTakenError,
  InviteInvalidError,
  acceptInvite,
  createGroup,
  createInvite,
  listInvites,
  listMembers,
  resolveInitialGroup,
  revokeInvite,
  type Authenticator,
  type InviteDeps,
  type Session,
} from "@art-flux/core";

export interface AppOptions {
  /** Validates the bearer credential and returns the session, or null if it is not valid. */
  authenticator: Authenticator;
  /** Repositories acting as this session's user. How they authorize is the adapter's business. */
  depsFor(session: Session): InviteDeps;
}

type Env = { Variables: { session: Session; deps: InviteDeps } };

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

  app.notFound((c) => c.json({ error: "not_found", message: "No existe esa ruta" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: "bad_request", message: err.message }, err.status);
    }
    if (Array.isArray((err as { issues?: unknown }).issues)) {
      const issue = (err as z.ZodError).issues[0];
      return c.json({ error: "validation", message: issue?.message ?? "Datos no válidos" }, 400);
    }
    if (err instanceof ForbiddenError) return c.json({ error: "forbidden", message: err.message }, 403);
    if (err instanceof InviteInvalidError) return c.json({ error: "invite_invalid", message: err.message }, 410);
    if (err instanceof HandleTakenError) return c.json({ error: "handle_taken", message: err.message }, 409);
    console.error(err);
    return c.json({ error: "internal", message: "Algo salió mal. Intenta de nuevo." }, 500);
  });

  return app;
}
