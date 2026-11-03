import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ForbiddenError,
  SessionNumberTakenError,
  type Session,
  type SessionPatch,
  type SessionScope,
  type SessionStatus,
  type SessionsRepo,
} from "@art-flux/core";

interface SessionRow {
  id: string;
  group_id: string;
  project_id: string | null;
  number: number;
  session_date: string | null;
  place: string | null;
  objective: string | null;
  status: SessionStatus;
  created_by: string;
  created_at: string;
}

const COLUMNS = "id, group_id, project_id, number, session_date, place, objective, status, created_by, created_at";

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  groupId: r.group_id,
  ...(r.project_id ? { projectId: r.project_id } : {}),
  number: r.number,
  ...(r.session_date ? { date: r.session_date } : {}),
  ...(r.place ? { place: r.place } : {}),
  ...(r.objective ? { objective: r.objective } : {}),
  status: r.status,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
});

const isNumberTaken = (e: { code?: string; message: string }) =>
  e.code === "23505" && /sessions_(project|group)_number_key/.test(e.message);

export class SupabaseSessionsRepo implements SessionsRepo {
  constructor(private readonly db: SupabaseClient) {}

  /** Builds the query for "this scope": a project, or the group-level sessions. */
  private scoped(groupId: string, scope: SessionScope) {
    const query = this.db.from("sessions").select(COLUMNS).eq("group_id", groupId).is("deleted_at", null);
    return scope.projectId === null ? query.is("project_id", null) : query.eq("project_id", scope.projectId);
  }

  async nextNumber(groupId: string, scope: SessionScope): Promise<number> {
    const { data, error } = await this.scoped(groupId, scope).order("number", { ascending: false }).limit(1);
    if (error) throw error;
    const top = (data as SessionRow[])[0];
    return top ? top.number + 1 : 1;
  }

  async create(session: Session): Promise<void> {
    const { error } = await this.db.from("sessions").insert({
      id: session.id,
      group_id: session.groupId,
      project_id: session.projectId ?? null,
      number: session.number,
      session_date: session.date ?? null,
      place: session.place ?? null,
      objective: session.objective ?? null,
      status: session.status,
      created_by: session.createdBy,
      created_at: session.createdAt.toISOString(),
    });
    if (error) {
      if (isNumberTaken(error)) throw new SessionNumberTakenError(session.number);
      throw error;
    }
  }

  async getById(sessionId: string): Promise<Session | null> {
    const { data, error } = await this.db
      .from("sessions")
      .select(COLUMNS)
      .eq("id", sessionId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toSession(data as SessionRow) : null;
  }

  async getByNumber(groupId: string, scope: SessionScope, number: number): Promise<Session | null> {
    const { data, error } = await this.scoped(groupId, scope).eq("number", number).maybeSingle();
    if (error) throw error;
    return data ? toSession(data as unknown as SessionRow) : null;
  }

  async list(groupId: string, scope?: SessionScope): Promise<Session[]> {
    const query = scope
      ? this.scoped(groupId, scope)
      : this.db.from("sessions").select(COLUMNS).eq("group_id", groupId).is("deleted_at", null);
    const { data, error } = await query.order("number");
    if (error) throw error;
    return (data as unknown as SessionRow[]).map(toSession);
  }

  async update(sessionId: string, patch: SessionPatch): Promise<Session> {
    const changes: Record<string, unknown> = {};
    if (patch.date !== undefined) changes.session_date = patch.date;
    if (patch.place !== undefined) changes.place = patch.place;
    if (patch.objective !== undefined) changes.objective = patch.objective;
    if (Object.keys(changes).length === 0) {
      const current = await this.getById(sessionId);
      if (!current) throw new Error("session not found");
      return current;
    }
    const { data, error } = await this.db.from("sessions").update(changes).eq("id", sessionId).select(COLUMNS).single();
    if (error) throw error;
    return toSession(data as SessionRow);
  }

  async attachAsOrigin(sessionId: string, projectId: string, number: number): Promise<Session> {
    const { data, error } = await this.db.rpc("attach_origin_session", {
      p_project: projectId,
      p_session: sessionId,
      p_number: number,
    });
    if (error) {
      if (isNumberTaken(error)) throw new SessionNumberTakenError(number);
      // The core checked already; the database refusing means the situation changed meanwhile.
      if (error.code === "P0004") throw new ForbiddenError("No se pudo usar esa sesión como origen");
      throw error;
    }
    return toSession(data as SessionRow);
  }
}
