/** Helpers to show sessions: "S02", dates without time-zone surprises, and "pasada". */

export const sessionLabel = (number: number) => `S${String(number).padStart(2, "0")}`;

/** The route segment of a session: s02 (as in conversonantes/cristina/s02). */
export const sessionSlug = (number: number) => sessionLabel(number).toLowerCase();

/** "s02" -> 2; anything else -> null. */
export function parseSessionSlug(segment: string): number | null {
  const match = /^s(\d+)$/.exec(segment);
  return match ? Number(match[1]) : null;
}

/** The route segment of an approach by its place in the session's list: p1, p2, p3… */
export const approachSlug = (order: number) => `p${order}`;

/** "p3" -> 3; anything else -> null. */
export function parseApproachSlug(segment: string): number | null {
  const match = /^p(\d+)$/.exec(segment);
  return match ? Number(match[1]) : null;
}

/** Today as "YYYY-MM-DD" in the person\x27s own calendar (not UTC). */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const dayMonth = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

/** "10 nov", or "5 ene 2020" when the year is not the current one. Compact on purpose. */
export function formatSessionDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d); // local calendar date: no UTC shift
  return (y === now.getFullYear() ? dayMonth : dayMonthYear).format(date).replace(/ de /g, " ");
}

/** A date before today: the session already happened or is being registered after the fact. */
export const isPastDate = (iso: string, now = new Date()) => iso < todayIso(now);
