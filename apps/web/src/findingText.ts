/**
 * The finding text is plain text with a few marks: **bold**, ==highlight== and "- " lists.
 * Nothing is stored as HTML; the screens turn these marks into elements (see FindingText).
 */

export type InlinePart = { text: string; bold: boolean; highlight: boolean };
export type FindingBlock = { type: "paragraph"; parts: InlinePart[] } | { type: "list"; items: InlinePart[][] };

/** Splits one line into pieces with their marks. Unclosed marks stay as the plain characters. */
export function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\*\*(.+?)\*\*|==(.+?)==/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index), bold: false, highlight: false });
    const bold = match[1] !== undefined;
    // A mark may wrap the other one: ==**así**==. One level is enough for this editor.
    const inner = match[1] ?? match[2] ?? "";
    const nested = parseInline(inner);
    for (const p of nested) parts.push({ ...p, bold: p.bold || bold, highlight: p.highlight || !bold });
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), bold: false, highlight: false });
  return parts;
}

/** Lines starting with "- " form a list; the rest are paragraphs. Blank lines separate them. */
export function parseFindingText(text: string): FindingBlock[] {
  const blocks: FindingBlock[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      const last = blocks[blocks.length - 1];
      const parts = parseInline(item[1] ?? "");
      if (last?.type === "list") last.items.push(parts);
      else blocks.push({ type: "list", items: [parts] });
    } else {
      blocks.push({ type: "paragraph", parts: parseInline(line) });
    }
  }
  return blocks;
}

export type Mark = "bold" | "highlight" | "list";
export interface Edit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAP: Record<"bold" | "highlight", string> = { bold: "**", highlight: "==" };

/** What the toolbar does to the text for a selection; the caret ends where typing should go on. */
export function applyMark(text: string, start: number, end: number, mark: Mark): Edit {
  if (mark === "list") {
    const from = text.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = text.indexOf("\n", end);
    const to = nextBreak === -1 ? text.length : nextBreak;
    const lines = text.slice(from, to).split("\n");
    const allListed = lines.every((l) => /^\s*-\s/.test(l));
    const changed = lines.map((l) => (allListed ? l.replace(/^(\s*)-\s/, "$1") : /^\s*-\s/.test(l) ? l : `- ${l}`));
    const block = changed.join("\n");
    return {
      text: text.slice(0, from) + block + text.slice(to),
      selectionStart: from,
      selectionEnd: from + block.length,
    };
  }

  const mark2 = WRAP[mark];
  const selected = text.slice(start, end);
  const wrapped = selected.startsWith(mark2) && selected.endsWith(mark2) && selected.length >= mark2.length * 2;
  if (wrapped) {
    // Pressing it again on a marked selection removes the marks.
    const inner = selected.slice(mark2.length, selected.length - mark2.length);
    return { text: text.slice(0, start) + inner + text.slice(end), selectionStart: start, selectionEnd: start + inner.length };
  }
  const insert = mark2 + selected + mark2;
  const caret = selected ? start + insert.length : start + mark2.length;
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    selectionStart: selected ? start : caret,
    selectionEnd: selected ? start + insert.length : caret,
  };
}
