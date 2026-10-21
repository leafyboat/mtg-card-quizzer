import type { FieldId, QuizCard, SymbolMap } from "../types.ts";
import { FIELDS } from "../game/fields.ts";
import { OracleText } from "./OracleText.tsx";
import { SymbolText } from "./SymbolText.tsx";

// Renders a single card part. Oracle text gets the full treatment (reminder
// stripping, ability-word emphasis, self-name redaction, mana symbols); mana
// cost gets symbol rendering; the rest are short plain strings.
export function FieldValue({
  field,
  card,
  symbols,
}: {
  field: FieldId;
  card: QuizCard;
  symbols: SymbolMap;
}) {
  switch (field) {
    case "oracleText":
      return <OracleText card={card} symbols={symbols} />;
    case "manaCost":
      return <SymbolText text={card.manaCost} symbols={symbols} />;
    default:
      return <>{FIELDS[field].value(card)}</>;
  }
}
