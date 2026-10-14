// Book word list for the vocabulary games, read from ?words=.
//
// Each game page turns ?words= into window.ALLOWED_WORDS, and the games match
// those words exactly against the lowercase spellings in mastervocab.js. This
// module is imported first by every game and makes that matching reliable:
//
//   1. Words are lowercased, so "Aaloo" finds "aaloo".
//   2. A book can keep its printed spelling for a word the shared vocabulary
//      spells differently by passing "bookSpelling=sharedSpelling"
//      (e.g. "piyay=pahiye"). The book spelling is added, in memory only, as
//      a variant of the shared card, so games show the book's spelling with
//      that card's Urdu, English, picture and riddles. mastervocab.js itself
//      is never changed and no duplicate cards are created.
import { vocab } from "./mastervocab.js";

const normalize = (w) => String(w || "").trim().toLowerCase();

// Every spelling (base or variant) → { card, urdu, english }
function buildFormIndex() {
  const index = new Map();
  for (const card of vocab) {
    const base = normalize(card.word?.baseRomanUrdu);
    if (base && !index.has(base)) {
      index.set(base, { card, urdu: card.word?.baseUrdu, english: card.word?.english });
    }
    for (const v of card.variants || []) {
      const ru = normalize(v?.romanUrdu);
      if (ru && !index.has(ru)) {
        index.set(ru, {
          card,
          urdu: v.urdu || card.word?.baseUrdu,
          english: v.english || card.word?.english,
        });
      }
    }
  }
  return index;
}

const raw = new URLSearchParams(location.search).get("words");
const entries = (raw || "")
  .split(",")
  .map((item) => {
    const [display, shared] = item.split("=").map(normalize);
    return { display, shared: shared && shared !== display ? shared : null };
  })
  .filter((e) => e.display);

// Book spelling → card id, for pages that show a card's main spelling.
export const bookSpellingByCardId = new Map();

const formIndex = buildFormIndex();
for (const { display, shared } of entries) {
  if (!shared || formIndex.has(display)) continue; // already a real spelling
  const target = formIndex.get(shared);
  if (!target) {
    console.warn(`[book-words] "${display}" points to "${shared}", which is not in mastervocab.js.`);
    continue;
  }
  target.card.variants = target.card.variants || [];
  target.card.variants.push({
    romanUrdu: display,
    urdu: target.urdu || "",
    english: target.english || "",
    bookSpelling: true,
  });
  formIndex.set(display, { card: target.card, urdu: target.urdu, english: target.english });
  bookSpellingByCardId.set(target.card.id, display);
}

// Ordered, de-duplicated book spellings.
export const bookWords = [...new Set(entries.map((e) => e.display))];

// Update the Set the page script created (keeps any references to it valid).
if (raw) {
  if (window.ALLOWED_WORDS instanceof Set) {
    window.ALLOWED_WORDS.clear();
    bookWords.forEach((w) => window.ALLOWED_WORDS.add(w));
  } else {
    window.ALLOWED_WORDS = new Set(bookWords);
  }
}
