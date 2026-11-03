/** Pure helpers for ordering approaches; the drag gesture only decides which two ids are involved. */

/** Moves `activeId` to the position `overId` has now (what dragging an item over another means). */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

/** The list arranged as `ids` says; anything not named keeps its place at the end. */
export function sortByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}
