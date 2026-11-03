import { parseFindingText, type InlinePart } from "../findingText";

function Parts({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((p, i) => {
        let node: React.ReactNode = p.text;
        if (p.bold) node = <strong key={`b${i}`}>{node}</strong>;
        if (p.highlight) node = <mark key={`h${i}`} className="bg-resaltador text-grafito">{node}</mark>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/** A finding fragment as people read it: paragraphs, lists, **bold** and ==highlight==. Never raw HTML. */
export function FindingText({ text }: { text: string }) {
  return (
    <div className="space-y-2 font-lectura text-xl leading-relaxed">
      {parseFindingText(text).map((block, i) =>
        block.type === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-6">
            {block.items.map((parts, j) => (
              <li key={j}>
                <Parts parts={parts} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Parts parts={block.parts} />
          </p>
        ),
      )}
    </div>
  );
}
