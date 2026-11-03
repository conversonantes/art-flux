import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError, type FindingFragment, type FindingKind, type FindingsRepo } from "@art-flux/core";

interface FragmentRow {
  id: string;
  approach_id: string;
  author_id: string;
  kind: FindingKind;
  text: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, approach_id, author_id, kind, text, created_at, updated_at";

const toFragment = (r: FragmentRow): FindingFragment => ({
  id: r.id,
  approachId: r.approach_id,
  authorId: r.author_id,
  kind: r.kind,
  text: r.text,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

export class SupabaseFindingsRepo implements FindingsRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getById(fragmentId: string): Promise<FindingFragment | null> {
    const { data, error } = await this.db
      .from("finding_fragments")
      .select(COLUMNS)
      .eq("id", fragmentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toFragment(data as FragmentRow) : null;
  }

  async listByApproach(approachId: string): Promise<FindingFragment[]> {
    const { data, error } = await this.db
      .from("finding_fragments")
      .select(COLUMNS)
      .eq("approach_id", approachId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw error;
    return (data as FragmentRow[]).map(toFragment);
  }

  async listByApproaches(approachIds: string[]): Promise<FindingFragment[]> {
    if (approachIds.length === 0) return [];
    const { data, error } = await this.db
      .from("finding_fragments")
      .select(COLUMNS)
      .in("approach_id", approachIds)
      .is("deleted_at", null);
    if (error) throw error;
    return (data as FragmentRow[]).map(toFragment);
  }

  async create(fragment: FindingFragment): Promise<void> {
    // The client's id makes a retried request harmless: the second insert does nothing.
    const { error } = await this.db.from("finding_fragments").upsert(
      {
        id: fragment.id,
        approach_id: fragment.approachId,
        author_id: fragment.authorId,
        kind: fragment.kind,
        text: fragment.text,
        created_at: fragment.createdAt.toISOString(),
        updated_at: fragment.updatedAt.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  async updateText(fragmentId: string, text: string, now: Date): Promise<FindingFragment> {
    const { data, error } = await this.db
      .from("finding_fragments")
      .update({ text, updated_at: now.toISOString() })
      .eq("id", fragmentId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return toFragment(data as FragmentRow);
  }

  async remove(fragmentId: string): Promise<void> {
    // An RPC: a plain UPDATE of deleted_at cannot pass RLS (see decisions/0006).
    const { error } = await this.db.rpc("remove_finding_fragment", { p_fragment: fragmentId });
    if (error) {
      if (error.code === "P0004") throw new ForbiddenError("No se pudo quitar el fragmento");
      throw error;
    }
  }
}
