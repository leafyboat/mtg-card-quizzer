import type { QuizCard } from "../types.ts";

// Self-name redaction: a card's own name spoils which card it is (oracle text
// says "put a +1/+1 counter on Crossbones"), so OracleText blacks it out.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-sensitive, whole-word match of any of `alt`. A leading boundary group
// (in place of a lookbehind, which older Safari lacks) keeps us from matching
// inside another word; the trailing lookahead leaves any possessive "'s" alone.
function wholeWord(alt: string, flags?: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, flags);
}

// The strings to black out. Rules text calls a card by its full name or a
// shortened one, so per face we collect each form it might use:
// - the full name, and the part before the first comma — the usual "legend"
//   short name ("Spider-Man, Peter Parker" -> "Spider-Man");
// - for a legendary face, the name before its first lowercase word ("Gollum
//   the Abandoned" -> "Gollum", "Kiora of Fire and Ashes" -> "Kiora") and, at
//   three words or more, its first and last word ("Captain James T. Kirk" ->
//   "Captain Kirk", "Dr. Beverly Crusher" -> "Dr. Crusher");
// - for a planeswalker, its planeswalker type ("Ajani Resolute" -> "Ajani").
// Longest first so the full name wins over the short ones.
export function redactionTargets(card: QuizCard): string[] {
  const faceTypes = card.typeLine.split(" // ");
  const targets = new Set<string>();
  card.name.split(" // ").forEach((face, i) => {
    const full = face.trim();
    if (!full) return;
    targets.add(full);
    const short = full.split(",")[0].trim();
    if (short) targets.add(short);

    const type = faceTypes[i] ?? "";
    if (!/\bLegendary\b/.test(type)) return;
    const words = short.split(/\s+/);
    const firstLower = words.findIndex((w) => /^[a-z]/.test(w));
    if (firstLower > 0) targets.add(words.slice(0, firstLower).join(" "));
    if (words.length >= 3) targets.add(`${words[0]} ${words[words.length - 1]}`);
    const dash = type.indexOf("—");
    if (/\bPlaneswalker\b/.test(type) && dash >= 0) {
      for (const sub of type.slice(dash + 1).trim().split(/\s+/)) targets.add(sub);
    }
  });
  return [...targets].sort((a, b) => b.length - a.length);
}

// Matches the card's own name (group 3), with the boundary character before it
// in group 1. Any keyword of the card's that contains its name — FRA's "Empower
// Jace" on Jace, Reality Sculptor — is matched first, in group 2, so it can be
// left readable: it's rules terminology, not the card naming itself.
export function selfNameRegex(card: QuizCard): RegExp | null {
  const targets = redactionTargets(card);
  if (targets.length === 0) return null;
  const keywords = card.keywords
    .filter((k) => targets.some((t) => wholeWord(escapeRegExp(t)).test(k)))
    // Either case on the first letter: keywords also open a clause mid-sentence
    // ("When this creature enters, empower Jace 2").
    .map((k) => `[${k[0].toUpperCase()}${k[0].toLowerCase()}]${escapeRegExp(k.slice(1))}`);
  const kept = keywords.length > 0 ? keywords.join("|") : "(?!)";
  return wholeWord(`(${kept})|(${targets.map(escapeRegExp).join("|")})`, "g");
}
