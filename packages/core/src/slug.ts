/** Shared by group handles and project slugs: readable, URL-safe identifiers. */
export const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Turns free text into a slug base: no accents, lowercase, hyphens. Uniqueness is not guaranteed. */
export function slugBase(text: string, opts: { fallback: string; min: number; max: number }): string {
  const clean = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, opts.max)
    .replace(/-+$/g, "");
  return clean.length >= opts.min ? clean : opts.fallback;
}

/** n-th candidate: base, base-2, base-3… within the max length, skipping reserved words. */
export function slugCandidate(
  base: string,
  attempt: number,
  opts: { max: number; reserved: { has(candidate: string): boolean } },
): string {
  const candidate =
    attempt <= 1
      ? base
      : `${base.slice(0, opts.max - String(attempt).length - 1).replace(/-+$/g, "")}-${attempt}`;
  return opts.reserved.has(candidate) ? slugCandidate(base, attempt + 1, opts) : candidate;
}
