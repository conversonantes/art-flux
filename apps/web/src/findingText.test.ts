import { describe, expect, it } from "vitest";
import { applyMark, parseFindingText, parseInline } from "./findingText";

const plain = (text: string) => ({ text, bold: false, highlight: false });

describe("parseInline", () => {
  it("marks bold and highlighted pieces and keeps the rest as it was", () => {
    expect(parseInline("Hay **mucha** claridad y ==se separan== al fin")).toEqual([
      plain("Hay "),
      { text: "mucha", bold: true, highlight: false },
      plain(" claridad y "),
      { text: "se separan", bold: false, highlight: true },
      plain(" al fin"),
    ]);
  });

  it("leaves unclosed marks alone and never produces HTML", () => {
    expect(parseInline("2 ** 3 y ==nada")).toEqual([plain("2 ** 3 y ==nada")]);
    expect(parseInline("<b>hola</b>")).toEqual([plain("<b>hola</b>")]);
  });

  it("allows one mark inside the other", () => {
    expect(parseInline("==**clave**==")).toEqual([{ text: "clave", bold: true, highlight: true }]);
  });
});

describe("parseFindingText", () => {
  it("groups consecutive '- ' lines into one list between paragraphs", () => {
    const blocks = parseFindingText("Primero\n- uno\n- **dos**\n\nDespués");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph"]);
    expect(blocks[1]).toMatchObject({ type: "list", items: [[plain("uno")], [{ text: "dos", bold: true }]] });
  });
});

describe("applyMark", () => {
  it("wraps the selection and puts the caret inside when there is none", () => {
    expect(applyMark("hola mundo", 5, 10, "bold")).toEqual({ text: "hola **mundo**", selectionStart: 5, selectionEnd: 14 });
    expect(applyMark("hola ", 5, 5, "highlight")).toEqual({ text: "hola ====", selectionStart: 7, selectionEnd: 7 });
  });

  it("removes the marks when pressed again on a marked selection", () => {
    const first = applyMark("hola mundo", 5, 10, "bold");
    const again = applyMark(first.text, first.selectionStart, first.selectionEnd, "bold");
    expect(again.text).toBe("hola mundo");
  });

  it("turns the selected lines into a list and back", () => {
    const listed = applyMark("uno\ndos\ntres", 0, 7, "list");
    expect(listed.text).toBe("- uno\n- dos\ntres");
    const back = applyMark(listed.text, listed.selectionStart, listed.selectionEnd, "list");
    expect(back.text).toBe("uno\ndos\ntres");
  });

  it("lists the line where the caret is", () => {
    expect(applyMark("uno\ndos", 5, 5, "list").text).toBe("uno\n- dos");
  });
});
