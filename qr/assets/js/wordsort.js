/**
 * wordsort.js — Word Sorter game logic
 *
 * HOW VOCAB IS LOADED
 * ───────────────────
 * The HTML bootstraps window.ALLOWED_WORDS (a Set of roman-urdu strings) from
 * the ?words= URL param that index.js appends when navigating here. The same
 * pattern used by matching.js, memory.js, etc.
 *
 * getActiveStoryWords() then filters the master vocab array to only those
 * entries whose baseRomanUrdu (or any variant romanUrdu) is in ALLOWED_WORDS.
 *
 * ADDING A NEW MODE
 * ─────────────────
 * 1. Write a buildXxxItems(storyVocab) → PlayableItem[] function.
 * 2. Add a case to getModeItems() and getBinsForMode().
 * 3. Add insights to PATTERN_INSIGHTS.
 * 4. Add a .mode-card button in the HTML with data-mode="xxx".
 * 5. Add a label to MODE_LABELS.
 */

import { vocab as masterVocab } from "./mastervocab.js";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const MODE_LABELS = {
  gender:  "Gender Sort",
  pos:     "Word Types",
  number:  "Singular & Plural",
  script:  "Script Match",
};

/**
 * Per-difficulty configuration.
 * cardCount: target number of cards per round.
 * showHints: whether bin helper labels pulse on first appear.
 * timer: whether a countdown is shown.
 * timerSecs: how many seconds.
 */
const DIFFICULTY = {
  1: { cardCount: 4,  showHints: true,  timer: false, timerSecs: 0  },
  2: { cardCount: 6,  showHints: true,  timer: false, timerSecs: 0  },
  3: { cardCount: 8,  showHints: false, timer: false, timerSecs: 0  },
  4: { cardCount: 10, showHints: false, timer: true,  timerSecs: 90 },
  5: { cardCount: 12, showHints: false, timer: true,  timerSecs: 60 },
};

const PTS_CORRECT       = 10;
const PTS_STREAK_BONUS  = 5;  // extra per streak level above 2

const PATTERN_INSIGHTS = {
  gender: [
    "Many Urdu nouns ending in '-i' are often feminine (e.g., roti, larki).",
    "Nouns ending in '-a' often tend to be masculine in Urdu.",
    "In Urdu, gender affects how adjectives and verbs change their form.",
    "Some words borrowed from Arabic or Persian can have any gender — checking is wise!",
    "Adjectives in Urdu often agree with the gender of the noun they describe.",
  ],
  pos: [
    "Verbs in Urdu often end in '-na' in their base form (e.g., khelna, aana, jana).",
    "Adjectives describe nouns — they can change form to match gender and number.",
    "Nouns name people, places, things, or ideas.",
    "Adverbs tell us when, where, or how something happens.",
    "The same word can sometimes act as different parts of speech depending on context.",
  ],
  number: [
    "Plural forms in Urdu often change the ending of the word.",
    "Feminine plurals sometimes end in '-en' or '-aan'.",
    "The same root word can take different endings when it becomes plural.",
    "Some words look similar in singular and plural — context often helps!",
    "Learning plural forms helps you read and understand more Urdu sentences.",
  ],
  script: [
    "Urdu script is written right to left — notice the direction!",
    "Roman Urdu uses the Latin alphabet to write Urdu sounds.",
    "The same word can look completely different across the three scripts.",
    "Learning Urdu script opens up a whole new way to read the language.",
    "Urdu and Arabic share the same script family — Nastaliq style.",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// GAME STATE — single source of truth
// ═══════════════════════════════════════════════════════════════════════

const state = {
  mode:        "gender",
  difficulty:  3,
  displayMode: "roman+english",
  theme:       "sky",

  // Scoring
  score:        0,
  streak:       0,
  roundScore:   0,
  roundCorrect: 0,
  roundWrong:   0,

  // Round data
  currentRound:   null,  // { items, bins, mode }
  roundItems:     [],    // all items this round (for progress)
  remainingItems: [],    // items not yet correctly placed
  reinforceQueue: [],    // items answered wrong — will replay
  correctItems:   [],    // items correctly placed

  // Timer
  timerActive:   false,
  timerSecs:     0,
  timerInterval: null,

  // Pointer / drag state (managed separately below)
};

// ═══════════════════════════════════════════════════════════════════════
// VOCAB HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Returns the subset of master vocab relevant to the current story.
 *
 * Story vocab comes from window.ALLOWED_WORDS (a Set of roman-urdu strings
 * built from the ?words= URL param). If empty, falls back to the full vocab.
 *
 * ── HOOK ────────────────────────────────────────────────────────────────
 * If your index.html exposes the word list differently (e.g. a global array
 * instead of a URL param), update the ALLOWED_WORDS bootstrap in the HTML
 * <script> block. This function just reads from that Set — it does not need
 * to change.
 * ── END HOOK ────────────────────────────────────────────────────────────
 */
function getActiveStoryWords() {
  if (!window.ALLOWED_WORDS || window.ALLOWED_WORDS.size === 0) {
    return masterVocab;
  }
  return masterVocab.filter(matchesAllowed);
}

function matchesAllowed(entry) {
  if (window.ALLOWED_WORDS.has(entry.word?.baseRomanUrdu)) return true;
  if (Array.isArray(entry.variants)) {
    return entry.variants.some(v => v?.romanUrdu && window.ALLOWED_WORDS.has(v.romanUrdu));
  }
  return false;
}

/** Flatten a raw vocab entry into a clean internal shape. */
function normalizeEntry(entry) {
  return {
    id:       entry.id,
    roman:    entry.word?.baseRomanUrdu || entry.id,
    urdu:     entry.word?.baseUrdu      || "",
    english:  entry.word?.english       || "",
    pos:      entry.word?.pos           || null,
    gender:   entry.grammar?.baseGender || null,
    variants: Array.isArray(entry.variants) ? entry.variants : [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ITEM BUILDERS — one per mode
// ═══════════════════════════════════════════════════════════════════════

/**
 * PlayableItem shape:
 * {
 *   id:          string   — vocab entry id
 *   key:         string   — unique card key (id + suffix for plurals/scripts)
 *   roman:       string
 *   urdu:        string
 *   english:     string
 *   category:    string   — must match a bin id
 *   hint:        string   — shown in feedback when wrong
 *   isScript?:   boolean  — true for Script mode cards
 *   scriptText?: string   — the single script string shown in Script mode
 * }
 */

function buildGenderItems(storyVocab) {
  const items = [];
  storyVocab.forEach(entry => {
    const n = normalizeEntry(entry);
    if (!n.gender) return;  // skip entries with no gender info
    items.push({
      id:       n.id,
      key:      n.id,
      roman:    n.roman,
      urdu:     n.urdu,
      english:  n.english,
      category: n.gender,   // "masculine" | "feminine"
      hint:     `${cap(n.roman)} is ${n.gender}.`,
    });
  });
  return items;
}

function buildPosItems(storyVocab) {
  const items = [];
  storyVocab.forEach(entry => {
    const n = normalizeEntry(entry);
    if (!n.pos) return;
    const cat = normalizePOS(n.pos);
    items.push({
      id:       n.id,
      key:      n.id,
      roman:    n.roman,
      urdu:     n.urdu,
      english:  n.english,
      category: cat,
      hint:     `${cap(n.roman)} is a ${cat}.`,
    });
  });
  return items;
}

/**
 * POS buckets: noun, verb, adjective, other.
 * "other" catches adverb, pronoun, particle, etc. — keeps bin count manageable.
 */
function normalizePOS(pos) {
  if (!pos) return "other";
  const p = pos.toLowerCase().trim();
  if (p === "noun")                  return "noun";
  if (p === "verb")                  return "verb";
  if (p === "adjective" || p === "adj") return "adjective";
  return "other";
}

function buildNumberItems(storyVocab) {
  const items = [];
  storyVocab.forEach(entry => {
    const n = normalizeEntry(entry);

    // Base form → singular card
    items.push({
      id:       n.id,
      key:      `${n.id}__singular`,
      roman:    n.roman,
      urdu:     n.urdu,
      english:  n.english,
      category: "singular",
      hint:     `${cap(n.roman)} is the singular form.`,
    });

    // Plural variants → plural cards
    const plurals = n.variants.filter(v => v.number === "plural");
    plurals.forEach((v, i) => {
      items.push({
        id:       n.id,
        key:      `${n.id}__plural_${i}`,
        roman:    v.romanUrdu  || n.roman,
        urdu:     v.urdu       || n.urdu,
        english:  `${n.english} (plural)`,
        category: "plural",
        hint:     `${cap(v.romanUrdu || n.roman)} is a plural form.`,
      });
    });
  });
  return items;
}

/**
 * Script Match: from each word, create one card per script type.
 * The card shows only that one text; the player sorts by script.
 * On lower difficulty (2 bins) we only use roman + english.
 */
function buildScriptItems(storyVocab, binCount = 3) {
  const scripts = binCount >= 3 ? ["roman", "urdu", "english"] : ["roman", "english"];
  const items = [];

  storyVocab.forEach(entry => {
    const n = normalizeEntry(entry);
    scripts.forEach(scriptType => {
      let scriptText = "";
      if (scriptType === "roman")   scriptText = n.roman;
      if (scriptType === "urdu")    scriptText = n.urdu;
      if (scriptType === "english") scriptText = n.english;
      if (!scriptText) return;

      items.push({
        id:         n.id,
        key:        `${n.id}__${scriptType}`,
        roman:      n.roman,
        urdu:       n.urdu,
        english:    n.english,
        category:   scriptType,
        isScript:   true,
        scriptText,
        hint:       scriptType === "urdu"
                      ? "That is Urdu script (right-to-left)."
                      : scriptType === "roman"
                        ? "That is Roman Urdu (Latin letters)."
                        : "That is English.",
      });
    });
  });
  return items;
}

function getModeItems(mode, storyVocab) {
  switch (mode) {
    case "gender": return buildGenderItems(storyVocab);
    case "pos":    return buildPosItems(storyVocab);
    case "number": return buildNumberItems(storyVocab);
    case "script": return buildScriptItems(storyVocab, 3);
    default:       return [];
  }
}

function getBinsForMode(mode, items) {
  switch (mode) {

    case "gender":
      return [
        { id: "masculine", label: "Masculine", emoji: "♂",  colorClass: "bin--blue" },
        { id: "feminine",  label: "Feminine",  emoji: "♀",  colorClass: "bin--pink" },
      ];

    case "pos": {
      // Only show bins for POS categories that actually appear in the item list
      const present = new Set(items.map(i => i.category));
      const all = [
        { id: "noun",      label: "Noun",      emoji: "📦", colorClass: "bin--orange" },
        { id: "verb",      label: "Verb",      emoji: "⚡", colorClass: "bin--teal"   },
        { id: "adjective", label: "Adjective", emoji: "🎨", colorClass: "bin--purple" },
        { id: "other",     label: "Other",     emoji: "💬", colorClass: "bin--gray"   },
      ];
      return all.filter(b => present.has(b.id));
    }

    case "number":
      return [
        { id: "singular", label: "Singular", emoji: "1️⃣",  colorClass: "bin--teal"   },
        { id: "plural",   label: "Plural",   emoji: "🔢",  colorClass: "bin--purple" },
      ];

    case "script":
      return [
        { id: "roman",   label: "Roman Urdu",  emoji: "Rr", colorClass: "bin--blue"   },
        { id: "urdu",    label: "Urdu Script", emoji: "ا",  colorClass: "bin--green"  },
        { id: "english", label: "English",     emoji: "Ee", colorClass: "bin--orange" },
      ];

    default: return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ROUND GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Builds a round object or returns null if the mode has insufficient data.
 * Selects a balanced set of cards (round-robin across bins) up to the
 * difficulty's cardCount, then shuffles them.
 */
function generateRound() {
  const storyVocab = getActiveStoryWords();
  const allItems   = getModeItems(state.mode, storyVocab);
  const bins       = getBinsForMode(state.mode, allItems);

  if (allItems.length < 2 || bins.length < 2) return null;

  // Only keep items whose category has a matching bin
  const validBinIds  = new Set(bins.map(b => b.id));
  const validItems   = allItems.filter(i => validBinIds.has(i.category));
  if (validItems.length < 2) return null;

  const targetCount = Math.min(DIFFICULTY[state.difficulty].cardCount, validItems.length);

  // Group items by category and shuffle each group
  const byCategory = {};
  bins.forEach(b => { byCategory[b.id] = []; });
  validItems.forEach(item => byCategory[item.category]?.push(item));
  Object.values(byCategory).forEach(pool => shuffle(pool));

  // Round-robin to ensure each bin gets at least one card
  const activeBinIds = bins.map(b => b.id).filter(id => byCategory[id]?.length > 0);
  const indices      = Object.fromEntries(activeBinIds.map(id => [id, 0]));
  const selected     = [];

  while (selected.length < targetCount) {
    let added = false;
    for (const binId of activeBinIds) {
      if (selected.length >= targetCount) break;
      const pool = byCategory[binId];
      const idx  = indices[binId];
      if (idx < pool.length) {
        selected.push(pool[idx]);
        indices[binId]++;
        added = true;
      }
    }
    if (!added) break; // ran out of items
  }

  return { items: shuffle(selected), bins, mode: state.mode };
}

// ═══════════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════════

function renderRound(round) {
  renderBins(round.bins);
  renderCards(round.items);
  updateHUD();
}

// ── Bins ──────────────────────────────────────────────────────────────

function renderBins(bins) {
  const row = document.getElementById("bins-row");
  row.innerHTML = "";
  row.dataset.count = bins.length;

  bins.forEach(bin => {
    const el = document.createElement("div");
    el.className  = `bin ${bin.colorClass}`;
    el.dataset.binId = bin.id;

    const isUrduBin = bin.id === "urdu";
    el.innerHTML = `
      <div class="bin-header">
        <span class="bin-emoji" aria-hidden="true">${bin.emoji}</span>
        <span class="bin-label ${isUrduBin ? "urdu-text" : ""}">${bin.label}</span>
      </div>
      <div class="bin-drop-zone" data-bin-id="${bin.id}" aria-label="${bin.label} drop zone">
        <div class="bin-drop-hint">Drop here</div>
      </div>`;

    // Tap-to-place: tapping a bin places the currently selected card
    el.addEventListener("pointerup", (e) => {
      // Only handle if it wasn't a drag release (drag releases go through onPointerUp)
      if (!dragRef.active && state.selectedCardId) {
        handleSort(state.selectedCardId, bin.id);
      }
    });

    row.appendChild(el);
  });
}

// ── Cards ─────────────────────────────────────────────────────────────

function renderCards(items) {
  const pool = document.getElementById("cards-pool");
  pool.innerHTML = "";
  items.forEach((item, i) => {
    const el = createCardEl(item);
    el.style.animationDelay = `${i * 0.04}s`;
    pool.appendChild(el);
  });
}

function createCardEl(item) {
  const el = document.createElement("div");
  el.className = "card";
  if (item.isScript) el.classList.add("card--script-card");
  el.dataset.itemKey = item.key;
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-pressed", "false");
  el.setAttribute("aria-label", `${item.roman}${item.english ? " – " + item.english : ""}`);

  el.innerHTML = buildCardHTML(item);

  // Pointer events: covers mouse + touch
  el.addEventListener("pointerdown",   e => onCardPointerDown(e, item, el));
  // Keyboard: Enter/Space selects the card
  el.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCardTap(item, el);
    }
  });

  return el;
}

function buildCardHTML(item) {
  // Script Match mode: show only the target script
  if (item.isScript) {
    const isUrdu = item.category === "urdu";
    return `<div class="${isUrdu ? "card-urdu" : "card-roman"}">${item.scriptText}</div>`;
  }

  const dm = state.displayMode;
  const parts = [];

  if (dm !== "urdu" && dm !== "english") {
    // Roman Urdu shown by all except urdu-only or english-only
    if (item.roman) parts.push(`<div class="card-roman">${item.roman}</div>`);
  }
  if (dm === "urdu" || dm === "roman+urdu" || dm === "all") {
    if (item.urdu) parts.push(`<div class="card-urdu">${item.urdu}</div>`);
  }
  if (dm === "english" || dm === "roman+english" || dm === "all") {
    if (item.english) parts.push(`<div class="card-english">${item.english}</div>`);
  }

  // Fallback: always show at least the roman form
  if (parts.length === 0 && item.roman) {
    parts.push(`<div class="card-roman">${item.roman}</div>`);
  }

  return parts.join("");
}

// ── HUD ───────────────────────────────────────────────────────────────

function updateHUD() {
  const total   = state.roundItems.length;
  const correct = state.roundCorrect;

  setText("hud-mode",         MODE_LABELS[state.mode] || state.mode);
  setText("hud-score",        state.score);
  setText("hud-streak",       state.streak);
  setText("hud-progress-lbl", `${correct}/${total}`);

  const bar = document.getElementById("hud-progress-bar");
  if (bar) bar.style.width = `${total > 0 ? (correct / total) * 100 : 0}%`;

  const streakBlock = document.getElementById("hud-streak-block");
  if (streakBlock) streakBlock.classList.toggle("streak-hot", state.streak >= 3);

  const cfg = DIFFICULTY[state.difficulty];
  toggleHidden("hud-timer", !cfg.timer);
}

function bumpScore() {
  const el = document.getElementById("hud-score");
  if (!el) return;
  el.classList.remove("bump");
  // Force reflow so class removal takes effect
  void el.offsetWidth;
  el.classList.add("bump");
  el.addEventListener("animationend", () => el.classList.remove("bump"), { once: true });
}

// ═══════════════════════════════════════════════════════════════════════
// DRAG / DROP + TAP
// ═══════════════════════════════════════════════════════════════════════

/**
 * dragRef stores mutable drag state outside of game state.
 * Managed per-pointer-gesture.
 */
const dragRef = {
  active:    false,
  item:      null,
  cardEl:    null,
  cloneEl:   null,
  startX:    0,
  startY:    0,
};

function onCardPointerDown(e, item, el) {
  // Only respond to primary button / first touch
  if (e.button !== undefined && e.button !== 0) return;

  e.preventDefault(); // prevent text selection and scroll interference

  dragRef.active  = false;
  dragRef.item    = item;
  dragRef.cardEl  = el;
  dragRef.cloneEl = null;
  dragRef.startX  = e.clientX;
  dragRef.startY  = e.clientY;

  el.setPointerCapture(e.pointerId);

  el.addEventListener("pointermove",   onPointerMove,   { passive: false });
  el.addEventListener("pointerup",     onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);
}

function onPointerMove(e) {
  const dx   = e.clientX - dragRef.startX;
  const dy   = e.clientY - dragRef.startY;
  const dist = Math.hypot(dx, dy);

  if (!dragRef.active && dist > 9) {
    // Cross drag threshold → start visual drag
    dragRef.active = true;
    dragRef.cardEl.classList.add("card--dragging");
    clearCardSelection();
    spawnDragClone(e);
  }

  if (dragRef.active && dragRef.cloneEl) {
    dragRef.cloneEl.style.left = `${e.clientX - dragRef.cloneEl._ox}px`;
    dragRef.cloneEl.style.top  = `${e.clientY - dragRef.cloneEl._oy}px`;
    highlightBinAt(e.clientX, e.clientY);
  }
}

function onPointerUp(e) {
  cleanupPointerListeners();

  if (dragRef.active) {
    // Dropped — find the bin under the pointer
    const binEl = binUnderPoint(e.clientX, e.clientY);
    dragRef.cardEl.classList.remove("card--dragging");
    if (dragRef.cloneEl) { dragRef.cloneEl.remove(); dragRef.cloneEl = null; }
    clearBinHighlights();

    if (binEl) {
      handleSort(dragRef.item.key, binEl.dataset.binId);
    }
    dragRef.active = false;
  } else {
    // Short tap — select / deselect
    onCardTap(dragRef.item, dragRef.cardEl);
  }

  dragRef.item   = null;
  dragRef.cardEl = null;
}

function onPointerCancel() {
  cleanupPointerListeners();
  if (dragRef.cloneEl)  { dragRef.cloneEl.remove(); dragRef.cloneEl = null; }
  if (dragRef.cardEl)   dragRef.cardEl.classList.remove("card--dragging");
  clearBinHighlights();
  dragRef.active = false;
  dragRef.item   = null;
  dragRef.cardEl = null;
}

function cleanupPointerListeners() {
  if (!dragRef.cardEl) return;
  dragRef.cardEl.removeEventListener("pointermove",   onPointerMove);
  dragRef.cardEl.removeEventListener("pointerup",     onPointerUp);
  dragRef.cardEl.removeEventListener("pointercancel", onPointerCancel);
}

function spawnDragClone(e) {
  const rect  = dragRef.cardEl.getBoundingClientRect();
  const clone = dragRef.cardEl.cloneNode(true);
  clone.classList.add("card--clone");
  clone.style.cssText = `
    position: fixed;
    width: ${rect.width}px;
    z-index: 1000;
    pointer-events: none;
  `;
  clone._ox = e.clientX - rect.left;
  clone._oy = e.clientY - rect.top;
  clone.style.left = `${e.clientX - clone._ox}px`;
  clone.style.top  = `${e.clientY - clone._oy}px`;
  document.body.appendChild(clone);
  dragRef.cloneEl = clone;
}

function binUnderPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (el.dataset.binId) return el;
    const p = el.closest("[data-bin-id]");
    if (p) return p;
  }
  return null;
}

function highlightBinAt(x, y) {
  clearBinHighlights();
  const binEl = binUnderPoint(x, y);
  if (binEl) {
    const bin = binEl.closest(".bin") || binEl;
    bin.classList.add("bin--dragover");
  }
}

function clearBinHighlights() {
  document.querySelectorAll(".bin--dragover").forEach(el => el.classList.remove("bin--dragover"));
}

/** Tap-to-select: first tap selects, tap same card deselects, tap different card switches. */
function onCardTap(item, el) {
  if (state.selectedCardId === item.key) {
    clearCardSelection();
  } else {
    clearCardSelection();
    state.selectedCardId = item.key;
    el.classList.add("card--selected");
    el.setAttribute("aria-pressed", "true");
  }
}

function clearCardSelection() {
  state.selectedCardId = null;
  document.querySelectorAll(".card--selected").forEach(el => {
    el.classList.remove("card--selected");
    el.setAttribute("aria-pressed", "false");
  });
}

// ═══════════════════════════════════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════════════════════════════════

function handleSort(itemKey, binId) {
  // Find in either queue
  const item = state.remainingItems.find(i => i.key === itemKey)
            || state.reinforceQueue.find(i => i.key === itemKey);
  if (!item) return;

  clearCardSelection();

  if (item.category === binId) {
    onCorrectSort(item, binId);
  } else {
    onWrongSort(item, binId);
  }
}

function onCorrectSort(item, binId) {
  // Remove from both queues
  state.remainingItems  = state.remainingItems.filter(i => i.key !== item.key);
  state.reinforceQueue  = state.reinforceQueue.filter(i => i.key !== item.key);
  state.correctItems.push(item);

  // Score
  state.streak++;
  const bonus  = state.streak > 2 ? (state.streak - 2) * PTS_STREAK_BONUS : 0;
  const pts    = PTS_CORRECT + bonus;
  state.score       += pts;
  state.roundScore  += pts;
  state.roundCorrect++;

  // Animate card
  const cardEl = document.querySelector(`[data-item-key="${item.key}"]`);
  const binDropZone = document.querySelector(`.bin-drop-zone[data-bin-id="${binId}"]`);
  if (cardEl) animateCorrect(cardEl, binDropZone, item);

  updateHUD();
  bumpScore();
  showToast(true, item, bonus);

  // Check if round is over after animation settles
  setTimeout(checkRoundEnd, 450);
}

function onWrongSort(item, binId) {
  // Move to reinforce queue (add once)
  state.remainingItems = state.remainingItems.filter(i => i.key !== item.key);
  if (!state.reinforceQueue.find(i => i.key === item.key)) {
    state.reinforceQueue.push(item);
  }

  state.streak    = 0;
  state.roundWrong++;

  const correctBin = state.currentRound.bins.find(b => b.id === item.category);
  const cardEl     = document.querySelector(`[data-item-key="${item.key}"]`);
  if (cardEl) animateWrong(cardEl);

  updateHUD();
  showToast(false, item, 0, correctBin);
}

function animateCorrect(cardEl, dropZone, item) {
  cardEl.classList.add("card--correct");
  setTimeout(() => {
    cardEl.remove();
    // Plant a mini card in the bin
    if (dropZone) {
      const hint = dropZone.querySelector(".bin-drop-hint");
      if (hint) hint.style.display = "none";
      const mini = document.createElement("div");
      mini.className = "bin-mini-card";
      const isUrdu = item.category === "urdu";
      mini.innerHTML = `<span class="${isUrdu ? "urdu-text" : ""}">${item.isScript ? item.scriptText : item.roman}</span>`;
      dropZone.appendChild(mini);
    }
  }, 480);
}

function animateWrong(cardEl) {
  cardEl.classList.add("card--wrong");
  setTimeout(() => cardEl.classList.remove("card--wrong"), 560);
  // Card stays in pool — it was moved to reinforceQueue but still rendered
  // Re-append to pool to keep it visible
  const pool = document.getElementById("cards-pool");
  if (pool && cardEl.parentElement !== pool) pool.appendChild(cardEl);
}

// ─── Reinforcement ────────────────────────────────────────────────────

function checkRoundEnd() {
  if (state.remainingItems.length > 0) return; // still items to sort

  if (state.reinforceQueue.length > 0) {
    // Re-deal the wrong answers
    showToast(false, null, 0, null, "Let's try those again! 🔄");
    setTimeout(() => {
      state.remainingItems = [...state.reinforceQueue];
      state.reinforceQueue = [];
      const pool = document.getElementById("cards-pool");
      pool.innerHTML = "";
      state.remainingItems.forEach((item, i) => {
        const el = createCardEl(item);
        el.style.animationDelay = `${i * 0.05}s`;
        pool.appendChild(el);
      });
    }, 900);
  } else {
    // All done — finish round
    endRound();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FEEDBACK TOAST
// ═══════════════════════════════════════════════════════════════════════

let _toastTimer = null;

function showToast(correct, item, bonus, correctBin, customMsg) {
  const toast = document.getElementById("feedback-toast");
  if (!toast) return;

  clearTimeout(_toastTimer);

  let msg;
  if (customMsg) {
    msg = customMsg;
    toast.className = "feedback-toast feedback-toast--info visible";
  } else if (correct) {
    const positives = ["Nice! ✨", "Correct! 🎉", "Great! 🌟", "Yes! 💫", "Perfect! ⭐", "Brilliant! 🏆"];
    msg = positives[Math.floor(Math.random() * positives.length)];
    if (bonus > 0) msg += `  Streak bonus: +${bonus} pts`;
    toast.className = "feedback-toast feedback-toast--correct visible";
  } else {
    const binLabel = correctBin ? correctBin.label : "the correct bin";
    if (item) {
      msg = `${cap(item.roman)} belongs in "${binLabel}". ${item.hint || ""}`;
    } else {
      msg = "Try again!";
    }
    toast.className = "feedback-toast feedback-toast--wrong visible";
  }

  toast.textContent = msg;
  _toastTimer = setTimeout(() => toast.classList.remove("visible"), correct ? 1600 : 3200);
}

// ═══════════════════════════════════════════════════════════════════════
// ROUND END
// ═══════════════════════════════════════════════════════════════════════

function endRound() {
  stopTimer();
  saveBestScore();
  if (state.roundCorrect >= state.roundItems.length * 0.8) launchConfetti();
  showRoundEndOverlay();
}

function showRoundEndOverlay() {
  const overlay  = document.getElementById("overlay-round-end");
  const total    = state.roundItems.length;
  const correct  = state.roundCorrect;
  const ratio    = total > 0 ? correct / total : 0;

  let emoji, title, sub;
  if (ratio >= 0.9)      { emoji = "🌟"; title = "Brilliant!";   sub = "You nailed every word!"; }
  else if (ratio >= 0.7) { emoji = "🎉"; title = "Great Work!";  sub = "Really solid sorting!"; }
  else if (ratio >= 0.5) { emoji = "👍"; title = "Good Try!";    sub = "Keep practising!"; }
  else                   { emoji = "💪"; title = "Keep Going!";  sub = "Every round teaches you something new."; }

  setText("overlay-emoji",   emoji);
  setText("overlay-title",   title);
  setText("overlay-sub",     sub);
  setText("stat-correct",    correct);
  setText("stat-wrong",      state.roundWrong);
  setText("stat-pts",        state.roundScore);

  // Pattern insights
  const insights    = pickInsights(state.mode);
  const insightsPanel = document.getElementById("insights-panel");
  const insightsBody  = document.getElementById("insights-body");
  if (insightsBody) {
    if (insights.length > 0) {
      insightsBody.innerHTML = insights.map(t => `<p class="insight-item">${t}</p>`).join("");
      if (insightsPanel) insightsPanel.style.display = "";
    } else {
      if (insightsPanel) insightsPanel.style.display = "none";
    }
  }

  if (overlay) overlay.classList.remove("hidden");
}

function pickInsights(mode) {
  const pool = PATTERN_INSIGHTS[mode] || [];
  return shuffle([...pool]).slice(0, 2);
}

// ═══════════════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════════════

function startTimer() {
  const cfg = DIFFICULTY[state.difficulty];
  if (!cfg.timer) return;

  state.timerActive   = true;
  state.timerSecs     = cfg.timerSecs;
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    state.timerSecs--;
    updateTimerDisplay();
    if (state.timerSecs <= 0) {
      stopTimer();
      endRound();
    }
  }, 1000);
}

function stopTimer() {
  state.timerActive = false;
  clearInterval(state.timerInterval);
}

function updateTimerDisplay() {
  setText("hud-timer-val", state.timerSecs);
  const timerEl = document.getElementById("hud-timer");
  if (timerEl) timerEl.classList.toggle("timer-warning", state.timerSecs <= 10);
}

// ═══════════════════════════════════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════════════════════════════════

function launchConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;

  canvas.style.display = "block";
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");

  const colors = ["#ff6b6b","#7c5cbf","#2ec4b6","#f59e0b","#f472b6","#34d399","#60a5fa"];
  const pieces = Array.from({ length: 90 }, () => ({
    x:    Math.random() * canvas.width,
    y:    -20 - Math.random() * 40,
    vx:   (Math.random() - 0.5) * 5,
    vy:   Math.random() * 4 + 2,
    rot:  Math.random() * 360,
    rotV: (Math.random() - 0.5) * 8,
    w:    Math.random() * 10 + 5,
    h:    Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12;
      p.rot += p.rotV;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = "none";
    }
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

const LS_THEME   = "kk-wordsort-theme";
const LS_DISPLAY = "kk-wordsort-display";

function saveBestScore() {
  const key     = `kk-wordsort-best-${state.mode}`;
  const current = parseInt(localStorage.getItem(key) || "0", 10);
  if (state.roundScore > current) localStorage.setItem(key, String(state.roundScore));
}

function loadPrefs() {
  state.theme       = localStorage.getItem(LS_THEME)   || "sky";
  state.displayMode = localStorage.getItem(LS_DISPLAY) || "roman+english";
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════

function showEmptyState() {
  const overlay = document.getElementById("overlay-empty");
  const msg     = document.getElementById("empty-msg");
  if (!overlay) return;
  if (msg) {
    const modeLabel = MODE_LABELS[state.mode] || state.mode;
    msg.textContent = `This story doesn't have enough words for "${modeLabel}" yet. Try a different mode!`;
  }
  overlay.classList.remove("hidden");
}

// ═══════════════════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("screen--active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("screen--active");
}

function applyTheme(theme) {
  document.body.className = document.body.className.replace(/theme-\w+/g, "").trim();
  document.body.classList.add(`theme-${theme}`);
}

// ═══════════════════════════════════════════════════════════════════════
// START GAME
// ═══════════════════════════════════════════════════════════════════════

function startGame() {
  const round = generateRound();
  if (!round) { showEmptyState(); return; }

  // Reset round-level state
  state.currentRound    = round;
  state.roundItems      = [...round.items];
  state.remainingItems  = [...round.items];
  state.reinforceQueue  = [];
  state.correctItems    = [];
  state.roundScore      = 0;
  state.roundCorrect    = 0;
  state.roundWrong      = 0;
  state.streak          = 0;
  state.selectedCardId  = null;

  showScreen("screen-game");
  renderRound(round);
  startTimer();
}

// ═══════════════════════════════════════════════════════════════════════
// MENU INIT
// ═══════════════════════════════════════════════════════════════════════

function initMenu() {
  loadPrefs();
  applyTheme(state.theme);

  // Reflect loaded prefs in the UI
  setActiveClass("#theme-row   .theme-swatch",   "theme-swatch--active", el => el.dataset.theme   === state.theme);
  setActiveClass("#display-grid .display-opt",   "display-opt--active",  el => el.dataset.display === state.displayMode);

  // ── Mode cards ──────────────────────────────────────────────────────
  on("#mode-grid .mode-card", "click", function () {
    setActiveClass("#mode-grid .mode-card", "mode-card--active", el => el === this);
    state.mode = this.dataset.mode;
  });

  // ── Difficulty pills ─────────────────────────────────────────────────
  on("#diff-row .diff-pill", "click", function () {
    setActiveClass("#diff-row .diff-pill", "diff-pill--active", el => el === this);
    state.difficulty = parseInt(this.dataset.level, 10);
  });

  // ── Display options ───────────────────────────────────────────────────
  on("#display-grid .display-opt", "click", function () {
    setActiveClass("#display-grid .display-opt", "display-opt--active", el => el === this);
    state.displayMode = this.dataset.display;
    localStorage.setItem(LS_DISPLAY, state.displayMode);
  });

  // ── Theme swatches ────────────────────────────────────────────────────
  on("#theme-row .theme-swatch", "click", function () {
    setActiveClass("#theme-row .theme-swatch", "theme-swatch--active", el => el === this);
    state.theme = this.dataset.theme;
    applyTheme(state.theme);
    localStorage.setItem(LS_THEME, state.theme);
  });

  // ── Start ─────────────────────────────────────────────────────────────
  document.getElementById("btn-start")?.addEventListener("click", startGame);

  // ── In-game controls ──────────────────────────────────────────────────
  document.getElementById("btn-menu")?.addEventListener("click", () => {
    stopTimer();
    showScreen("screen-menu");
  });

  document.getElementById("btn-hint")?.addEventListener("click", showHint);

  // ── Round end overlay ──────────────────────────────────────────────────
  document.getElementById("btn-next-round")?.addEventListener("click", () => {
    document.getElementById("overlay-round-end").classList.add("hidden");
    startGame();
  });
  document.getElementById("btn-change-mode")?.addEventListener("click", () => {
    document.getElementById("overlay-round-end").classList.add("hidden");
    stopTimer();
    showScreen("screen-menu");
  });

  // ── Empty state overlay ────────────────────────────────────────────────
  document.getElementById("btn-empty-back")?.addEventListener("click", () => {
    document.getElementById("overlay-empty").classList.add("hidden");
    showScreen("screen-menu");
  });
}

function showHint() {
  const item = state.remainingItems[0] || state.reinforceQueue[0];
  if (!item) return;
  const bin = state.currentRound?.bins.find(b => b.id === item.category);
  showToast(false, null, 0, null, `Hint: "${item.roman}" → ${bin ? bin.label : item.category} 💡`);
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function toggleHidden(id, hide) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden", hide);
}

/** Attach the same event listener to all elements matching selector. */
function on(selector, event, handler) {
  document.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));
}

/** Toggle an active class across a group based on a predicate. */
function setActiveClass(selector, activeClass, predicate) {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.toggle(activeClass, predicate(el));
  });
}

// ═══════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", initMenu);
