# MTG Card Quizzer

A flashcard-style web app for learning Magic: The Gathering sets. It shows a
card's art and name, gives you some of its info, then asks you to pick another
part of it from six options — training fast "see the card → recall what it
does" recognition.

Currently ships with **Marvel Super Heroes** (`MSH`), **The Hobbit** (`HOB`),
**Reality Fracture** (`FRA`) and **Star Trek** (`TRK`, still in previews).

It's a fully static single-page app (no backend). Card data comes from
[Scryfall](https://scryfall.com) and is pre-fetched into `public/cards.json`.

## How it works

- Each round shows one card (art crop + name, plus whatever else you've put in
  the prompt) and six **same-type** options for the part being quizzed — the
  correct one plus five distractors.
- **Sets** (top-right gear) lets you quiz from one set or several at once. A new
  visitor starts on the most recently released set. Within a question, the wrong
  answers are drawn from the shown card's *own* set, so mixing sets varies which
  cards come up without making any single question easier.
- **Customize** (top-right gear) lets you route each part of a card — oracle
  text, mana cost, type line, keywords, power/toughness — to one of three slots:
  shown in the **prompt**, used as a **quiz** item, or **hidden**. Set several
  parts to "quiz" and each round picks one of them at random. By default you're
  given the mana cost and quizzed on the oracle text.
- Several cleanups keep the options legible and spoiler-free: reminder text is
  stripped, ability words are italicized, mana symbols are rendered, and the
  card's **own name is blacked out** of its rules text so it can't give itself
  away.
- Sagas are cropped to just their art (their frame bakes rules text into the
  art image), and double-faced cards (e.g. *Bruce Banner // The Incredible
  Hulk*) are quizzed as two separate cards.
- Missed cards resurface more often (lightweight spaced repetition), with
  per-card progress and your best streak saved to `localStorage`.

## Develop

```bash
npm install
npm run fetch   # download/refresh set data -> public/cards.json, sets.json, symbols.json
npm run dev     # start the dev server
npm run build   # type-check + production build into dist/
```

`npm run fetch` pulls every set listed in the `SETS` array at the top of
`scripts/fetch-cards.mjs` (including each card's keywords). **To add a set**, add
its Scryfall set code there and re-run the fetch — it shows up in the picker
automatically. Re-run it to pick up data/art updates, too (a daily GitHub
Actions workflow does this on `main`): a set still in spoiler season — TRK,
releasing 2026-11-13 — comes down partial and grows as more cards are previewed.
