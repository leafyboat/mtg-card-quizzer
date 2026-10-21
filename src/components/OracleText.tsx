import type { ReactNode } from "react";
import type { QuizCard, SymbolMap } from "../types.ts";
import { cleanOracle } from "../game/formatText.ts";
import { selfNameRegex } from "../game/redaction.ts";
import { InlineSymbols } from "./SymbolText.tsx";

// Matches an "ability word" prefix at the start of a line, e.g. "Power-up —"
// or "Enrage —". By Magic's typography these are italic; emphasizing them helps
// the eye find the mechanic quickly when scanning options.
const ABILITY_WORD = /^([A-Z][A-Za-z' -]{1,24}?) — /;

// Renders one line, blacking out the card's own name (see game/redaction.ts)
// and drawing mana symbols.
function renderLine(
  line: string,
  symbols: SymbolMap,
  nameRegex: RegExp | null,
): ReactNode {
  if (!nameRegex) return <InlineSymbols text={line} symbols={symbols} />;

  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  nameRegex.lastIndex = 0;
  while ((m = nameRegex.exec(line)) !== null) {
    // A keyword that contains the name stays part of the plain text run.
    if (m[2] !== undefined) continue;
    const boundary = m[1];
    const name = m[3];
    const textEnd = m.index + boundary.length;
    if (textEnd > last) {
      nodes.push(
        <InlineSymbols key={key++} text={line.slice(last, textEnd)} symbols={symbols} />,
      );
    }
    nodes.push(
      <span key={key++} className="redacted" aria-label="this card">
        {name}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    nodes.push(<InlineSymbols key={key++} text={line.slice(last)} symbols={symbols} />);
  }
  return <>{nodes}</>;
}

// Renders cleaned oracle text: reminder text removed, each ability on its own
// line, ability words italicized, "//" shown as a face divider, the card's own
// name blacked out, and mana symbols drawn as icons.
export function OracleText({
  card,
  symbols,
}: {
  card: QuizCard;
  symbols: SymbolMap;
}) {
  const lines = cleanOracle(card.oracleText).split("\n");
  const nameRegex = selfNameRegex(card);

  return (
    <>
      {lines.map((line, i) => {
        if (line === "//") {
          return <span key={i} className="oracle-divider" aria-hidden />;
        }
        const m = line.match(ABILITY_WORD);
        return (
          <span key={i} className="oracle-line">
            {m && <em className="ability-word">{m[1]}</em>}
            {m && " — "}
            {renderLine(m ? line.slice(m[0].length) : line, symbols, nameRegex)}
          </span>
        );
      })}
    </>
  );
}
