import { z } from "zod";

/** searching = en búsqueda · staging = en montaje · running = en temporada · archived = archivada. */
export const PROJECT_STATUSES = ["searching", "staging", "running", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Artistic roles offered by default. They are labels, not permissions, and any other
 * slug-like role is accepted so the same model can serve other creative processes.
 */
export const SUGGESTED_ROLES = ["owner", "director", "actor", "technician"] as const;

export const PROJECT_SLUG_MIN = 3;
export const PROJECT_SLUG_MAX = 40;
export const MAX_THEMES = 8;
export const MAX_ROLES = 6;

const RESERVED_PROJECT_WORDS: ReadonlySet<string> = new Set([
  "invitar",
  "obras",
  "nueva",
  "editar",
  "equipo",
  "sesiones",
  "miembros",
  "ajustes",
  "new",
  "edit",
  "team",
  "sessions",
  "members",
  "settings",
  "projects",
]);

/**
 * Slugs a project cannot take: words that collide with project sub-routes, and S01, S02...
 * which are the addresses of sessions (/group/s02 and /group/project/s02).
 */
export const RESERVED_PROJECT_SLUGS: { has(slug: string): boolean } = {
  has: (slug) => RESERVED_PROJECT_WORDS.has(slug) || /^s\d+$/.test(slug),
};

/** "#Memoria  " → "memoria"; drops empties and duplicates. */
export function normalizeThemes(themes: string[]): string[] {
  const clean = themes
    .map((t) => t.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, 30));
  return [...new Set(clean)];
}

/** Roles as stored: lowercase slugs. */
export const rolesSchema = z
  .array(z.string())
  .transform((roles) => [...new Set(roles.map((r) => r.trim().toLowerCase()).filter(Boolean))])
  .pipe(
    z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Rol no válido").max(30))
      .max(MAX_ROLES, `Máximo ${MAX_ROLES} roles por persona`),
  );

const title = z.string().trim().min(1, "La obra necesita un título").max(120);
const status = z.enum(PROJECT_STATUSES, "Estado no válido");
const themes = z
  .array(z.string())
  .transform(normalizeThemes)
  .pipe(z.array(z.string()).max(MAX_THEMES, `Máximo ${MAX_THEMES} temas`));
const agreement = z.string().trim().max(2000, "El acuerdo es muy largo");

export const createProjectSchema = z.object({
  title,
  status: status.optional().transform((s) => s ?? "searching"),
  themes: themes.optional().transform((t) => t ?? []),
  visibilityAgreement: agreement.optional().transform((a) => a || undefined),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

/** Every field optional; an empty agreement clears it (null). */
export const updateProjectSchema = z.object({
  title: title.optional(),
  status: status.optional(),
  themes: themes.optional(),
  visibilityAgreement: agreement.optional().transform((a) => (a === undefined ? undefined : a || null)),
});
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export interface Project {
  id: string;
  groupId: string;
  /** Readable id within the group, used in URLs (conversonantes/cristina). Stable after creation. */
  slug: string;
  title: string;
  status: ProjectStatus;
  themes: string[];
  visibilityAgreement?: string;
  /** The group session this project was born from (HU-05); set when that session is attached. */
  originSessionId?: string;
  createdAt: Date;
}

export interface ProjectPatch {
  title?: string;
  status?: ProjectStatus;
  themes?: string[];
  /** null clears it. */
  visibilityAgreement?: string | null;
}

export interface TeamMember {
  userId: string;
  roles: string[];
  displayName?: string;
}
