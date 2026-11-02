import type { ProjectStatus } from "./api/api";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  searching: "En búsqueda",
  staging: "En montaje",
  running: "En temporada",
  archived: "Archivada",
};

/** Roles offered as chips. Labels only: roles never change what anyone can do. */
export const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "director", label: "Director" },
  { value: "actor", label: "Actor" },
  { value: "technician", label: "Técnico" },
] as const;

const ROLE_LABEL: Record<string, string> = { technician: "técnico" };

/** "owner · director" as drawn in the project screen; unknown roles show as stored. */
export function rolesText(roles: string[]): string {
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(" · ");
}
