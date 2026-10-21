// Player customization, persisted to localStorage. Each card part is routed to
// one of three roles — shown in the prompt, quizzed on, or hidden — and when
// several parts are set to "quiz" each round picks one of them at random.

import type { FieldId, FieldRole, QuizCard, SetInfo } from "../types.ts";
import { FIELD_IDS, FIELDS } from "./fields.ts";

const STORAGE_KEY = "msh-settings-v1";
const SETS_STORAGE_KEY = "msh-selected-sets-v1";

export type Settings = Record<FieldId, FieldRole>;

// Defaults preserve the original quiz: read the mana cost, recall the oracle
// text. The other parts start hidden and can be opted into.
export const DEFAULT_SETTINGS: Settings = {
  oracleText: "quiz",
  manaCost: "prompt",
  typeLine: "hidden",
  keywords: "hidden",
  powerToughness: "hidden",
};

// A quiz needs something to quiz on; if a stored config somehow has nothing set
// to "quiz", fall back to oracle text.
function ensureQuizable(settings: Settings): Settings {
  return quizFieldIds(settings).length > 0
    ? settings
    : { ...settings, oracleText: "quiz" };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return ensureQuizable({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable (private mode / quota) — ignore.
  }
}

export function quizFieldIds(settings: Settings): FieldId[] {
  return FIELD_IDS.filter((id) => settings[id] === "quiz");
}

export function promptFieldIds(settings: Settings): FieldId[] {
  return FIELD_IDS.filter((id) => settings[id] === "prompt");
}

// The quiz fields that actually apply to this card (e.g. power/toughness only
// counts for creatures).
export function availableQuizFields(
  card: QuizCard,
  settings: Settings,
): FieldId[] {
  return quizFieldIds(settings).filter((id) => FIELDS[id].has(card));
}

// Cards that can be quizzed at all under the current settings.
export function eligibleCards(
  cards: QuizCard[],
  settings: Settings,
): QuizCard[] {
  return cards.filter((c) => availableQuizFields(c, settings).length > 0);
}

// --- Set selection -------------------------------------------------------
// Which sets are in play is a separate concern from how each field is routed,
// so it lives under its own localStorage key. The stored value is a list of
// Scryfall set codes; anything no longer in the manifest is ignored.

// Today's date as YYYY-MM-DD (local time), comparable with a set's `released`.
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The default for a brand-new visitor: just the most recently released set. A
// set still in spoiler season (release date in the future) comes down partial,
// so it only becomes the default once it's out — or if nothing is out yet.
export function defaultSelectedSets(available: SetInfo[]): string[] {
  const today = todayIso();
  const released = available.filter((s) => s.released <= today);
  const pool = released.length > 0 ? released : available;
  if (pool.length === 0) return [];
  const latest = pool.reduce((a, b) =>
    b.released.localeCompare(a.released) > 0 ? b : a,
  );
  return [latest.code];
}

// Load the player's chosen set codes, filtered to those still available. Falls
// back to the newest released set when nothing valid is stored (first visit,
// or every stored code has since disappeared from the manifest).
export function loadSelectedSets(available: SetInfo[]): string[] {
  const codes = new Set(available.map((s) => s.code));
  try {
    const raw = localStorage.getItem(SETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (c): c is string => typeof c === "string" && codes.has(c),
        );
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // Ignore malformed/unavailable storage and fall back to the default.
  }
  return defaultSelectedSets(available);
}

export function saveSelectedSets(selected: string[]): void {
  try {
    localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(selected));
  } catch {
    // localStorage may be unavailable (private mode / quota) — ignore.
  }
}

// The cards drawn from the currently selected sets.
export function cardsInSets(cards: QuizCard[], selected: string[]): QuizCard[] {
  const set = new Set(selected);
  return cards.filter((c) => set.has(c.set));
}

// Pick which part of `card` to quiz this round, at random among those that
// apply. Falls back to oracle text if nothing applies (shouldn't happen once
// the deck is filtered to eligible cards).
export function pickQuizField(card: QuizCard, settings: Settings): FieldId {
  const fields = availableQuizFields(card, settings);
  return fields.length > 0
    ? fields[Math.floor(Math.random() * fields.length)]
    : "oracleText";
}
