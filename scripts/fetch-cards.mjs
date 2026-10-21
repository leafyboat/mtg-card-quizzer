// Downloads one or more MTG sets from Scryfall and writes a normalized, trimmed
// dataset the static app can load directly:
//   public/cards.json    - one entry per quizzable card, each tagged with `set`
//   public/sets.json     - [{ code, name, released, count, icon }] set manifest
//   public/symbols.json  - { "{R}": "<svg url>", ... } for rendering mana symbols
//
// Scryfall asks API consumers to identify themselves and to cache results rather
// than hammer the live API, which is exactly what this build-time script does.
// Scryfall 403s anonymous/generic fetchers, so we drive `curl` with an explicit
// User-Agent (verified to work) instead of relying on Node's fetch.
//
// Run with: npm run fetch

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public");

const USER_AGENT = "mtg-quizzer/0.1 (nick@heise.org)";

// The sets to include in the quiz, by Scryfall set code. Add a code here and
// re-run `npm run fetch` to make a set selectable in the app. Sets that are
// still in spoiler season (e.g. TRK) come down partial and grow as more cards
// are previewed — just re-fetch to pick them up.
const SETS = ["msh", "hob", "fra", "trk"];

// `-t:basic` excludes every card with the Basic supertype (including full-art
// printings). Note: `-is:basic` does NOT work for MSH — Scryfall still returns
// the basics, and their printed reminder-only text ("({T}: Add {U}.)") renders
// blank once cleanOracle() strips it, producing an empty "correct" answer.
const searchUrl = (code) =>
  `https://api.scryfall.com/cards/search?q=set%3A${encodeURIComponent(
    code,
  )}+-t%3Abasic&unique=cards&order=name`;
const setInfoUrl = (code) =>
  `https://api.scryfall.com/sets/${encodeURIComponent(code)}`;
const SYMBOLOGY_URL = "https://api.scryfall.com/symbology";

function getJson(url) {
  const body = execFileSync(
    "curl",
    ["-sS", "-A", USER_AGENT, "-H", "Accept: application/json", url],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(body);
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// The frame layouts/types we treat as "primary" for picking similar distractors.
const PRIMARY_TYPES = [
  "Creature",
  "Planeswalker",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Land",
  "Battle",
];

function primaryType(typeLine = "") {
  return PRIMARY_TYPES.find((t) => typeLine.includes(t)) ?? "Other";
}

// Collapse a card (including double-faced / modal cards whose data lives in
// card_faces[]) into a single quiz entry.
function normalize(card, setCode) {
  const faces = card.card_faces ?? [];

  const artCrop =
    card.image_uris?.art_crop ?? faces[0]?.image_uris?.art_crop ?? null;

  const image =
    card.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null;

  const oracleText =
    card.oracle_text ??
    faces
      .map((f) => f.oracle_text)
      .filter(Boolean)
      .join("\n//\n");

  const typeLine = card.type_line ?? faces[0]?.type_line ?? "";

  return {
    id: card.id,
    set: setCode,
    name: card.name,
    artCrop,
    image,
    oracleText: (oracleText ?? "").trim(),
    typeLine,
    primaryType: primaryType(typeLine),
    manaCost: card.mana_cost ?? faces[0]?.mana_cost ?? "",
    keywords: card.keywords ?? [],
    power: card.power ?? faces[0]?.power,
    toughness: card.toughness ?? faces[0]?.toughness,
    rarity: card.rarity ?? "",
    colors: card.colors ?? faces[0]?.colors ?? [],
  };
}

// Layouts that are physically double-sided — you only ever see one face at a
// time (e.g. Bruce Banner transforms into The Incredible Hulk). We quiz each
// face as its own card so recognizing either side counts. Other multi-face
// layouts (adventure, split) show both texts on one visible face, so they stay
// a single entry via normalize().
const SPLIT_LAYOUTS = new Set(["transform", "modal_dfc"]);

function faceToQuiz(card, face, i, setCode) {
  return {
    id: `${card.id}-${i}`,
    set: setCode,
    name: face.name,
    artCrop: face.image_uris?.art_crop ?? null,
    image: face.image_uris?.normal ?? null,
    oracleText: (face.oracle_text ?? "").trim(),
    typeLine: face.type_line ?? "",
    primaryType: primaryType(face.type_line ?? ""),
    manaCost: face.mana_cost ?? "",
    // Scryfall reports keywords at the card level, not per face.
    keywords: card.keywords ?? [],
    power: face.power,
    toughness: face.toughness,
    rarity: card.rarity ?? "",
    colors: face.colors ?? card.colors ?? [],
  };
}

// Returns one quiz entry per card, except double-sided cards which yield one
// entry per face.
function toQuizCards(card, setCode) {
  if (SPLIT_LAYOUTS.has(card.layout) && Array.isArray(card.card_faces)) {
    return card.card_faces.map((face, i) => faceToQuiz(card, face, i, setCode));
  }
  return [normalize(card, setCode)];
}

async function fetchSetCards(code) {
  const all = [];
  let url = searchUrl(code);
  let page = 0;
  while (url) {
    page += 1;
    const data = getJson(url);
    if (data.object === "error") {
      throw new Error(`Scryfall error for set ${code}: ${data.details}`);
    }
    all.push(...data.data);
    process.stdout.write(`  ${code} page ${page}: ${all.length} cards so far\n`);
    url = data.has_more ? data.next_page : null;
    if (url) await sleep(120); // be polite to the API
  }
  return all;
}

function fetchSetInfo(code) {
  const data = getJson(setInfoUrl(code));
  if (data.object === "error") {
    throw new Error(`Scryfall error for set ${code}: ${data.details}`);
  }
  // `icon_svg_uri` is the set's symbol as a monochrome SVG; the app masks it
  // with a rarity colour to stand in for the printed set symbol.
  return {
    name: data.name,
    released: data.released_at ?? "",
    icon: data.icon_svg_uri ?? "",
  };
}

// A card whose entire oracle text is reminder text (parentheticals) — e.g. a
// basic land's "({T}: Add {U}.)" — renders blank in the UI once cleanOracle()
// strips it, so it can't be a valid quiz answer. Mirror that stripping here to
// drop such cards at build time.
const meaningfulText = (t) => t.replace(/\s*\([^)]*\)/g, "").trim().length > 0;

function fetchSymbols() {
  const data = getJson(SYMBOLOGY_URL);
  const map = {};
  for (const sym of data.data) {
    if (sym.symbol && sym.svg_uri) map[sym.symbol] = sym.svg_uri;
  }
  return map;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const cards = [];
  const manifest = [];

  for (const code of SETS) {
    const info = fetchSetInfo(code);
    console.log(`Fetching ${code} (${info.name}) from Scryfall...`);
    const raw = await fetchSetCards(code);

    const entries = raw.flatMap((c) => toQuizCards(c, code));
    // Require art and *meaningful* oracle text (see meaningfulText above).
    const kept = entries.filter(
      (c) => c.artCrop && meaningfulText(c.oracleText),
    );

    cards.push(...kept);
    manifest.push({
      code,
      name: info.name,
      released: info.released,
      count: kept.length,
      icon: info.icon,
    });
    console.log(
      `  ${code}: kept ${kept.length} quiz cards from ${raw.length} Scryfall cards ` +
        `(dropped ${entries.length - kept.length} without art/oracle text).`,
    );
    await sleep(120);
  }

  cards.sort((a, b) => a.name.localeCompare(b.name));
  // Newest set first, so the app's "latest set" default is easy to read off.
  manifest.sort((a, b) => b.released.localeCompare(a.released));

  writeFileSync(
    join(OUT_DIR, "cards.json"),
    JSON.stringify(cards, null, 0) + "\n",
  );
  writeFileSync(
    join(OUT_DIR, "sets.json"),
    JSON.stringify(manifest, null, 0) + "\n",
  );
  console.log(
    `Wrote ${cards.length} quiz cards across ${manifest.length} sets to ` +
      `public/cards.json (+ public/sets.json).`,
  );

  console.log("Fetching mana symbols...");
  const symbols = fetchSymbols();
  writeFileSync(
    join(OUT_DIR, "symbols.json"),
    JSON.stringify(symbols, null, 0) + "\n",
  );
  console.log(`Wrote ${Object.keys(symbols).length} symbols to public/symbols.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
