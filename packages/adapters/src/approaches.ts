import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, ForbiddenError, type Approach, type ApproachPatch, type ApproachesRepo } from "@art-flux/core";

interface ApproachRow {
  id: string;
  session_id: string;
  position: number;
  text: string;
  owner_id: string;
  created_by: string;
  created_at: string;
}

const COLUMNS = "id, session_id, position, text, owner_id, created_by, created_at";

const toApproach = (r: ApproachRow): Approach => ({
  id: r.id,
  sessionId: r.session_id,
  position: r.position,
  text: r.text,
  ownerId: r.owner_id,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
});

export class SupabaseApproachesRepo implements ApproachesRepo {
  constructor(private readonly db: SupabaseClient) {}

  async nextPosition(sessionId: string): Promise<number> {
    const { data, error } = await this.db
      .from("approaches")
      .select("position")
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("position", { ascending: false })
      .limit(1);
    if (error) throw error;
    const top = (data as { position: number }[])[0];
    return top ? top.position + 1 : 1;
  }

  async create(approach: Approach): Promise<void> {
    const { error } = await this.db.from("approaches").insert({
      id: approach.id,
      session_id: approach.sessionId,
      position: approach.position,
      text: approach.text,
      owner_id: approach.ownerId,
      created_by: approach.createdBy,
      created_at: approach.createdAt.toISOString(),
    });
    if (error) throw error;
  }

  async getById(approachId: string): Promise<Approach | null> {
    const { data, error } = await this.db
      .from("approaches")
      .select(COLUMNS)
      .eq("id", approachId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toApproach(data as ApproachRow) : null;
  }

  async listBySession(sessionId: string): Promise<Approach[]> {
    const { data, error } = await this.db
      .from("approaches")
      .select(COLUMNS)
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("position")
      .order("created_at");
    if (error) throw error;
    return (data as ApproachRow[]).map(toApproach);
  }

  async update(approachId: string, patch: ApproachPatch): Promise<Approach> {
    const changes: Record<string, unknown> = {};
    if (patch.text !== undefined) changes.text = patch.text;
    if (patch.ownerId !== undefined) changes.owner_id = patch.ownerId;
    if (Object.keys(changes).length === 0) {
      const current = await this.getById(approachId);
      if (!current) throw new Error("approach not found");
      return current;
    }
    const { data, error } = await this.db.from("approaches").update(changes).eq("id", approachId).select(COLUMNS).single();
    if (error) throw error;
    return toApproach(data as ApproachRow);
  }

  async remove(approachId: string): Promise<void> {
    // An RPC: a plain UPDATE of deleted_at is not possible under RLS (see migration remove_approach).
    const { error } = await this.db.rpc("remove_approach", { p_approach: approachId });
    if (error) {
      if (error.code === "P0004") throw new ForbiddenError("No se pudo quitar el planteamiento");
      throw error;
    }
  }

  async reorder(sessionId: string, orderedIds: string[]): Promise<void> {
    const { error } = await this.db.rpc("reorder_approaches", { p_session: sessionId, p_ids: orderedIds });
    if (error) {
      // The core checked the list already; the database refusing means it changed in between.
      if (error.code === "P0005") throw new ConflictError("La lista cambió mientras la ordenabas. Recárgala e intenta de nuevo.");
      throw error;
    }
  }
}
