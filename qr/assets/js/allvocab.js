/**
 * All Cards — Vocabulary Explorer
 * Kahani Korner
 *
 * Displays only the vocabulary for the current story,
 * filtered from the master vocab list.
 */

import { vocab } from "./mastervocab.js";

// ============================================================
// HOW THE STORY PAGE SHOULD SAVE CURRENT STORY VOCAB
// ============================================================
//
// In your story's index.html (or index.js), add this before
// linking to allvocab.html:
//
//   // Option A — save orderedWords (array of romanUrdu IDs):
//   sessionStorage.setItem(
//     "kk_current_story_vocab",
//     JSON.stringify(window.STORY_HOME_CONFIG.orderedWords)
//   );
//
//   // Then link to All Cards (the activity button):
//   // href="/qr/assets/html/allvocab.html"
//
// The allvocab page also supports ?words= query param
// (same format as other games: ?words=chaand,raat,gali,...).
// If both exist, ?words= takes priority.
// ============================================================

// ---------- Constants & selectors ----------

const STORAGE_KEYS = {
  storyVocab: "kk_current_story_vocab",
  known: "kk_allvocab_known",
  displayMode: "kk_allvocab_displayMode",
  direction: "kk_allvocab_direction",
  sort: "kk_allvocab_sort",
  density: "kk_allvocab_density",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  grid: $("#cards-grid"),
  searchInput: $("#search-input"),
  searchClear: $("#search-clear"),
  sortSelect: $("#sort-select"),
  cardCount: $("#card-count"),
  toggleFiltersBtn: $("#toggle-filters-btn"),
  filtersLabel: $("#filters-label"),
  filterPanel: $("#filter-panel"),
  emptyNoStory: $("#empty-no-story"),
  emptyNoResults: $("#empty-no-results"),
  backBtn: $("#back-btn"),
  retryBtn: $("#retry-btn"),
  emptyBackBtn: $("#empty-back-btn"),
  resetViewBtn: $("#reset-view-btn"),
  resetFiltersBtn: $("#reset-filters-btn"),
};

// ---------- State ----------

let state = {
  direction: "urdu-english",   // "urdu-english" | "english-urdu"
  displayMode: "both",         // "both" | "image" | "word"
  filters: {                   // toggleable filters
    verbs: false,
    "new-only": false,
  },
  search: "",
  sort: "default",
  density: "comfortable",      // "comfortable" | "compact"
  tab: "all",                  // "all" | "known" | "new"
  knownIds: new Set(),
};

let storyVocab = [];           // filtered vocab from master list
let storyVocabIds = [];        // ordered IDs from story context

// ---------- Storage helpers ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function loadKnown() {
  const arr = loadJSON(STORAGE_KEYS.known, []);
  state.knownIds = new Set(Array.isArray(arr) ? arr : []);
}

function saveKnown() {
  saveJSON(STORAGE_KEYS.known, [...state.knownIds]);
}

function loadPersistedState() {
  state.direction = localStorage.getItem(STORAGE_KEYS.direction) || "urdu-english";
  state.displayMode = localStorage.getItem(STORAGE_KEYS.displayMode) || "both";
  state.sort = localStorage.getItem(STORAGE_KEYS.sort) || "default";
  state.density = localStorage.getItem(STORAGE_KEYS.density) || "comfortable";
  loadKnown();
}

function saveDirection() { localStorage.setItem(STORAGE_KEYS.direction, state.direction); }
function saveDisplayMode() { localStorage.setItem(STORAGE_KEYS.displayMode, state.displayMode); }
function saveSort() { localStorage.setItem(STORAGE_KEYS.sort, state.sort); }
function saveDensity() { localStorage.setItem(STORAGE_KEYS.density, state.density); }

// ---------- Current story vocab reader ----------

function readStoryVocabIds() {
  // Priority 1: ?words= query param (consistent with other games)
  const params = new URLSearchParams(location.search);
  const wordsParam = params.get("words");
  if (wordsParam) {
    return wordsParam.split(",").map((w) => w.trim()).filter(Boolean);
  }

  // Priority 2: sessionStorage
  const raw = sessionStorage.getItem(STORAGE_KEYS.storyVocab);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Support: array of strings OR array of objects with .id
    return parsed.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && item.id) return String(item.id).trim();
      return "";
    }).filter(Boolean);
  } catch {
    return null;
  }
}

// ---------- Master vocab normalization & filtering ----------

/** Build a lookup: romanUrdu (lower) -> vocab entry, also include variant forms */
function buildVocabLookup() {
  const map = new Map();
  for (const entry of vocab) {
    // Map by id
    if (entry.id) map.set(entry.id.toLowerCase(), entry);
    // Map by baseRomanUrdu
    const roman = entry.word?.baseRomanUrdu;
    if (roman) map.set(roman.toLowerCase(), entry);
    // Map variant romanUrdu forms
    if (Array.isArray(entry.variants)) {
      for (const v of entry.variants) {
        if (v.romanUrdu) map.set(v.romanUrdu.toLowerCase(), entry);
      }
    }
  }
  return map;
}

function filterMasterVocab(ids) {
  const lookup = buildVocabLookup();
  const seen = new Set();
  const result = [];

  for (const id of ids) {
    const key = id.toLowerCase();
    const entry = lookup.get(key);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      result.push(entry);
    } else if (!entry && !seen.has(key)) {
      // Word not in mastervocab — show as a text-only fallback card
      seen.add(key);
      result.push({
        id,
        word: { baseRomanUrdu: id, baseUrdu: "", english: "", pos: "" },
        grammar: {},
        variants: [],
        image: null,
      });
    }
  }
  return result;
}

// ---------- Image helpers ----------

function hasValidImage(entry) {
  const img = entry.image;
  if (!img) return false;
  if (img.includes("noimage")) return false;
  return true;
}

function getImageSrc(entry) {
  if (!hasValidImage(entry)) return null;
  return entry.image;
}

// ---------- Derive visible cards ----------

function getFilteredSortedCards() {
  let cards = [...storyVocab];

  // Tab filter
  if (state.tab === "known") {
    cards = cards.filter((c) => state.knownIds.has(c.id));
  } else if (state.tab === "new") {
    cards = cards.filter((c) => !state.knownIds.has(c.id));
  }

  // Filters
  if (state.filters.verbs) {
    cards = cards.filter((c) => c.word?.pos === "verb");
  }
  if (state.filters["new-only"]) {
    cards = cards.filter((c) => !state.knownIds.has(c.id));
  }

  // Search
  const q = state.search.toLowerCase().trim();
  if (q) {
    cards = cards.filter((c) => {
      const fields = [
        c.id,
        c.word?.baseRomanUrdu,
        c.word?.baseUrdu,
        c.word?.english,
        c.word?.pos,
      ].filter(Boolean);

      // Include variant forms in search
      if (Array.isArray(c.variants)) {
        for (const v of c.variants) {
          if (v.romanUrdu) fields.push(v.romanUrdu);
          if (v.urdu) fields.push(v.urdu);
        }
      }

      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }

  // Sort
  switch (state.sort) {
    case "az-english":
      cards.sort((a, b) => (a.word?.english || "").localeCompare(b.word?.english || ""));
      break;
    case "az-roman":
      cards.sort((a, b) => (a.word?.baseRomanUrdu || "").localeCompare(b.word?.baseRomanUrdu || ""));
      break;
    case "unknown-first":
      cards.sort((a, b) => {
        const aK = state.knownIds.has(a.id) ? 1 : 0;
        const bK = state.knownIds.has(b.id) ? 1 : 0;
        return aK - bK;
      });
      break;
    case "known-first":
      cards.sort((a, b) => {
        const aK = state.knownIds.has(a.id) ? 0 : 1;
        const bK = state.knownIds.has(b.id) ? 0 : 1;
        return aK - bK;
      });
      break;
    // "default" preserves story order
  }

  return cards;
}

// ---------- Render helpers ----------

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function renderCardFrontContent(entry) {
  const isUrduFirst = state.direction === "urdu-english";
  const showImage = state.displayMode !== "word";
  const showWord = state.displayMode !== "image";
  const imgSrc = getImageSrc(entry);
  let html = "";

  if (showImage && imgSrc) {
    html += `<img class="card-image" src="${escHtml(imgSrc)}" alt="${escHtml(entry.word?.english || "")}" loading="lazy" onerror="this.style.display='none'" />`;
  }

  if (showWord) {
    if (isUrduFirst) {
      html += `<span class="card-urdu">${escHtml(entry.word?.baseUrdu)}</span>`;
      html += `<span class="card-roman">${escHtml(entry.word?.baseRomanUrdu)}</span>`;
    } else {
      html += `<span class="card-english">${escHtml(entry.word?.english)}</span>`;
    }
  }

  // In image-only mode, still show a tiny label hint so front isn't totally empty if no image
  if (state.displayMode === "image" && !imgSrc) {
    if (isUrduFirst) {
      html += `<span class="card-urdu">${escHtml(entry.word?.baseUrdu)}</span>`;
    } else {
      html += `<span class="card-english">${escHtml(entry.word?.english)}</span>`;
    }
  }

  return html;
}

function renderCardBackContent(entry) {
  const isUrduFirst = state.direction === "urdu-english";
  let html = "";

  if (isUrduFirst) {
    html += `<span class="card-english">${escHtml(entry.word?.english)}</span>`;
  } else {
    html += `<span class="card-urdu">${escHtml(entry.word?.baseUrdu)}</span>`;
    html += `<span class="card-roman">${escHtml(entry.word?.baseRomanUrdu)}</span>`;
  }

  // Part of speech
  if (entry.word?.pos) {
    html += `<span class="card-pos">${escHtml(entry.word.pos)}</span>`;
  }

  // Gender
  if (entry.grammar?.baseGender) {
    html += `<span class="card-gender">${escHtml(entry.grammar.baseGender)}</span>`;
  }

  // Variants
  if (Array.isArray(entry.variants) && entry.variants.length > 0) {
    html += `<div class="card-variants">`;
    for (const v of entry.variants) {
      html += `<div class="variant-row">`;
      if (v.romanUrdu) html += `<span class="variant-roman">${escHtml(v.romanUrdu)}</span>`;
      if (v.urdu) html += `<span class="variant-urdu">${escHtml(v.urdu)}</span>`;
      const meta = [v.gender, v.number].filter(Boolean).join(", ");
      if (meta) html += `<span class="variant-meta">(${escHtml(meta)})</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  return html;
}

// ---------- Render cards ----------

function renderCards() {
  const cards = getFilteredSortedCards();

  // Update counter
  els.cardCount.textContent = `${cards.length}/${storyVocab.length}`;

  // Empty states
  if (cards.length === 0 && storyVocab.length > 0) {
    els.grid.innerHTML = "";
    els.emptyNoResults.hidden = false;
    return;
  }
  els.emptyNoResults.hidden = true;

  // Build grid HTML
  const fragment = document.createDocumentFragment();

  cards.forEach((entry, i) => {
    const accentClass = `card-accent-${i % 8}`;
    const isKnown = state.knownIds.has(entry.id);

    const wrapper = document.createElement("div");
    wrapper.className = `card-wrapper ${accentClass}${isKnown ? " is-known" : ""}`;
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", `${entry.word?.english || entry.id} vocabulary card. Tap to flip.`);
    wrapper.dataset.id = entry.id;

    wrapper.innerHTML = `
      <button type="button" class="card-know-btn${isKnown ? " known" : ""}"
              aria-label="${isKnown ? "Unmark" : "Mark"} as known"
              aria-pressed="${isKnown}" title="${isKnown ? "Unmark known" : "I know this!"}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isKnown ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
      <div class="card">
        <div class="card-face card-front">
          ${renderCardFrontContent(entry)}
          <span class="card-flip-hint">tap to flip</span>
        </div>
        <div class="card-face card-back">
          ${renderCardBackContent(entry)}
        </div>
      </div>
    `;

    fragment.appendChild(wrapper);
  });

  els.grid.innerHTML = "";
  els.grid.appendChild(fragment);
}

// ---------- Render control states ----------

function syncChips() {
  // Direction
  $$("[data-direction]").forEach((btn) => {
    const active = btn.dataset.direction === state.direction;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // Display mode
  $$("[data-display]").forEach((btn) => {
    const active = btn.dataset.display === state.displayMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // Filters
  $$("[data-filter]").forEach((btn) => {
    const active = state.filters[btn.dataset.filter] || false;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // Density
  $$("[data-density]").forEach((btn) => {
    const active = btn.dataset.density === state.density;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // Sort
  els.sortSelect.value = state.sort;

  // Tabs
  $$("[data-tab]").forEach((btn) => {
    const active = btn.dataset.tab === state.tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  // Density class on body
  document.body.classList.toggle("density-compact", state.density === "compact");

  // Update filter toggle badge
  syncFiltersBadge();
}

function syncFiltersBadge() {
  const activeCount =
    Object.values(state.filters).filter(Boolean).length +
    (state.displayMode !== "both" ? 1 : 0) +
    (state.density !== "comfortable" ? 1 : 0);

  els.filtersLabel.textContent = activeCount > 0 ? `Filters (${activeCount})` : "Filters";
  els.toggleFiltersBtn.classList.toggle("has-active-filters", activeCount > 0);
}

// ---------- Event handlers ----------

function handleCardClick(e) {
  const wrapper = e.target.closest(".card-wrapper");
  if (!wrapper) return;

  // "I know this" button
  const knowBtn = e.target.closest(".card-know-btn");
  if (knowBtn) {
    e.stopPropagation();
    const id = wrapper.dataset.id;
    if (state.knownIds.has(id)) {
      state.knownIds.delete(id);
    } else {
      state.knownIds.add(id);
    }
    saveKnown();
    renderCards();
    return;
  }

  // Flip card
  const card = wrapper.querySelector(".card");
  if (card) {
    card.classList.toggle("flipped");
  }
}

function handleKeyboardFlip(e) {
  if (e.key === "Enter" || e.key === " ") {
    const wrapper = e.target.closest(".card-wrapper");
    if (wrapper) {
      e.preventDefault();
      const card = wrapper.querySelector(".card");
      if (card) card.classList.toggle("flipped");
    }
  }
}

function bindControlEvents() {
  // Filter panel toggle
  els.toggleFiltersBtn.addEventListener("click", () => {
    const open = els.filterPanel.hidden;
    els.filterPanel.hidden = !open;
    els.toggleFiltersBtn.setAttribute("aria-expanded", String(open));
  });

  // Tab buttons
  $$("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      syncChips();
      renderCards();
    });
  });

  // Direction chips
  $$("[data-direction]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.direction = btn.dataset.direction;
      saveDirection();
      syncChips();
      renderCards();
    });
  });

  // Display mode chips
  $$("[data-display]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.displayMode = btn.dataset.display;
      saveDisplayMode();
      syncChips();
      renderCards();
    });
  });

  // Filter chips (toggle)
  $$("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.filter;
      state.filters[key] = !state.filters[key];
      syncChips();
      renderCards();
    });
  });

  // Density chips
  $$("[data-density]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.density = btn.dataset.density;
      saveDensity();
      syncChips();
      renderCards();
    });
  });

  // Sort
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    saveSort();
    renderCards();
  });

  // Search
  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = els.searchInput.value;
      els.searchClear.classList.toggle("hidden", !state.search);
      renderCards();
    }, 180);
  });

  els.searchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    state.search = "";
    els.searchClear.classList.add("hidden");
    renderCards();
    els.searchInput.focus();
  });

  // Cards grid — event delegation
  els.grid.addEventListener("click", handleCardClick);
  els.grid.addEventListener("keydown", handleKeyboardFlip);

  // Back button
  els.backBtn.addEventListener("click", () => history.back());
  if (els.emptyBackBtn) els.emptyBackBtn.addEventListener("click", () => history.back());

  // Retry
  if (els.retryBtn) {
    els.retryBtn.addEventListener("click", () => {
      location.reload();
    });
  }

  // Reset view (does NOT clear known progress)
  els.resetViewBtn.addEventListener("click", () => {
    state.direction = "urdu-english";
    state.displayMode = "both";
    state.filters = { verbs: false, "new-only": false };
    state.search = "";
    state.sort = "default";
    state.density = "comfortable";
    state.tab = "all";

    els.searchInput.value = "";
    els.searchClear.classList.add("hidden");

    saveDirection();
    saveDisplayMode();
    saveSort();
    saveDensity();

    els.filterPanel.hidden = true;
    els.toggleFiltersBtn.setAttribute("aria-expanded", "false");

    syncChips();
    renderCards();
  });

  // Reset filters (from no-results empty state)
  if (els.resetFiltersBtn) {
    els.resetFiltersBtn.addEventListener("click", () => {
      state.filters = { verbs: false, "new-only": false };
      state.search = "";
      els.searchInput.value = "";
      els.searchClear.classList.add("hidden");
      syncChips();
      renderCards();
    });
  }
}

// ---------- Initialization ----------

function init() {
  loadPersistedState();

  // Read current story vocab
  const ids = readStoryVocabIds();

  if (!ids || ids.length === 0) {
    // Show empty/help state — no story context
    els.emptyNoStory.hidden = false;
    els.grid.style.display = "none";
    $(".toolbar").style.display = "none";
    $(".card-tabs-bar").style.display = "none";
    bindControlEvents();
    return;
  }

  storyVocabIds = ids;
  storyVocab = filterMasterVocab(ids);

  if (storyVocab.length === 0) {
    els.emptyNoStory.hidden = false;
    els.grid.style.display = "none";
    $(".toolbar").style.display = "none";
    $(".card-tabs-bar").style.display = "none";
    bindControlEvents();
    return;
  }

  syncChips();
  renderCards();
  bindControlEvents();
}

init();
