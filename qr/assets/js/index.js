const config = window.STORY_HOME_CONFIG;

if (!config) {
  throw new Error("STORY_HOME_CONFIG is missing on this page.");
}

const pageTitle = document.getElementById("page-title");
const storyTitleEl = document.getElementById("story-title");
const bookCoverEl = document.getElementById("book-cover");
const levelPickerEl = document.getElementById("level-picker");
const buttonContainerEl = document.getElementById("button-container");

const storageKey = `kk-story-level-${config.slug}`;

// ── Story mode ────────────────────────────────────────────────
const LARGE_STORY_THRESHOLD = 30;
const TOTAL_LEVELS = 5;
const CHUNK_LEVELS = 4;

function isLargeStory() {
  return config.orderedWords.length > LARGE_STORY_THRESHOLD;
}

// ── Word selection ────────────────────────────────────────────
// Small/medium stories: cumulative levels, Level 5 = all words
// Large stories: Levels 1–4 = word sets/chunks, Level 5 = all words
const LEVEL_TARGETS = {
  1: 6,
  2: 10,
  3: 15,
  4: 22,
  5: Infinity,
};

const MIN_WORDS = 6;

function getWordsForLevel(words, level) {
  if (level === 5) {
    return words.slice();
  }

  if (isLargeStory()) {
    const chunkSize = Math.ceil(words.length / CHUNK_LEVELS);
    const start = (level - 1) * chunkSize;
    const end = Math.min(start + chunkSize, words.length);
    return words.slice(start, end);
  }

  if (words.length <= MIN_WORDS) {
    return words.slice();
  }

  const target = LEVEL_TARGETS[level] ?? MIN_WORDS;
  return words.slice(0, Math.min(words.length, Math.max(MIN_WORDS, target)));
}

// ── Persistence ───────────────────────────────────────────────
function clampLevel(level, totalLevels) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(totalLevels, level));
}

function loadSavedLevel() {
  const raw = Number(localStorage.getItem(storageKey));
  if (!raw) return 1;
  return clampLevel(raw, TOTAL_LEVELS);
}

function saveLevel(level) {
  localStorage.setItem(storageKey, String(level));
}

function buildWordsParam(words) {
  return encodeURIComponent(words.join(","));
}

function renderHeader() {
  const title = config.title || "Kahani Korner Story";

  document.title = `Kahani Korner | ${title}`;

  if (pageTitle) {
    pageTitle.textContent = `Kahani Korner | ${title}`;
  }

  if (storyTitleEl) {
    storyTitleEl.textContent = title;
  }

  if (bookCoverEl && config.coverImage) {
    bookCoverEl.style.backgroundImage = `url("${config.coverImage}")`;
  }
}

let currentLevel;

// ── Shared pill helper ────────────────────────────────────────
function updatePillStates() {
  document.querySelectorAll(".level-pill").forEach((pill) => {
    const lvl = Number(pill.getAttribute("data-level"));
    pill.classList.toggle("active", lvl === currentLevel);
  });
}

function makePill(value, label, ariaLabel) {
  const pill = document.createElement("button");
  pill.className = `level-pill${value === currentLevel ? " active" : ""}`;
  pill.type = "button";
  pill.textContent = label;
  pill.setAttribute("data-level", value);
  pill.setAttribute("aria-label", ariaLabel);
  return pill;
}

function renderLevelPills() {
  currentLevel = loadSavedLevel();
  if (!levelPickerEl) return;

  const totalWords = config.orderedWords.length;

  levelPickerEl.innerHTML = `
    <div class="level-picker-label">Choose Words</div>
    <div class="level-pills" id="level-pills"></div>
    <p id="level-summary" class="level-summary"></p>
  `;

  const pillsContainer = document.getElementById("level-pills");

  for (let level = 1; level <= TOTAL_LEVELS; level++) {
    const words = getWordsForLevel(config.orderedWords, level);
    const label = level === 5 ? "All" : `${level}`;
    const ariaLabel =
      level === 5 ? `All ${totalWords} words` : `Set ${level} — ${words.length} words`;

    const pill = makePill(level, label, ariaLabel);

    pill.addEventListener("click", () => {
      currentLevel = level;
      saveLevel(level);
      updatePillStates();
      updateSummary(level, totalWords);
      renderButtons();
    });

    pillsContainer.appendChild(pill);
  }

  updateSummary(currentLevel, totalWords);
}

function updateSummary(level, totalWords) {
  const summaryEl = document.getElementById("level-summary");
  if (!summaryEl) return;

  if (level === 5) {
    summaryEl.textContent = `All ${totalWords} words`;
    return;
  }

  if (isLargeStory()) {
    const chunkSize = Math.ceil(totalWords / CHUNK_LEVELS);
    const start = (level - 1) * chunkSize;
    const end = Math.min(start + chunkSize, totalWords);
    summaryEl.textContent = `Words ${start + 1}–${end} of ${totalWords}`;
  } else {
    const count = getWordsForLevel(config.orderedWords, level).length;
    summaryEl.textContent = `${count} of ${totalWords} words`;
  }
}

// Helper text shown beneath each tile label
const HELPER_TEXT = {
  readaloud: "Listen to the story",
  allvocabcards: "Practice these words",
  allstory: "Browse everything",
  flashcards: "Flip and learn",
  quiz: "Test what you know",
  fillblank: "Complete the sentence",
  matching: "Match words to images",
  riddles: "Guess the word",
  memory: "Find matching pairs",
  wordsearch: "Spot hidden words",
  speedgrid: "Tap fast and win",
  fallingwords: "Catch words in time",
};

// Defines the 3 learning stages and which game IDs belong to each
const SECTION_ICONS = {
  learn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3v4"/>
  <path d="M12 17v4"/>
  <path d="M4.22 4.22l2.83 2.83"/>
  <path d="M16.95 16.95l2.83 2.83"/>
  <path d="M1 12h4"/>
  <path d="M19 12h4"/>
  <path d="M4.22 19.78l2.83-2.83"/>
  <path d="M16.95 7.05l2.83-2.83"/>
</svg>`,
  challenge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 18V5"/>
  <path d="M15 18V5"/>
  <path d="M9 5a3 3 0 0 0-6 0v2a3 3 0 0 0 3 3"/>
  <path d="M15 5a3 3 0 0 1 6 0v2a3 3 0 0 1-3 3"/>
  <path d="M6 10a4 4 0 0 0 12 0"/>
</svg>`,
  practice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <circle cx="12" cy="12" r="6"/>
  <circle cx="12" cy="12" r="2"/>
</svg>`,
};

const SECTIONS = [
  {
    key: "learn",
    label: "Learn — Start Here",
    ids: ["readaloud", "allvocabcards", "allstory"],
  },
  {
    key: "practice",
    label: "Practice",
    ids: ["flashcards", "matching", "fillblank", "riddles"],
  },
  {
    key: "challenge",
    label: "Challenge",
    ids: ["quiz", "memory", "wordsearch", "speedgrid", "fallingwords"],
  },
];

// SVG icons for each activity
const ACTIVITY_ICONS = {
  readaloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  flashcards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="m8 13 4-7 4 7"/><path d="M9.1 11h5.7"/></svg>`,
  quiz: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V7"/><path d="m16 12 2 2 4-4"/><path d="M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3"/></svg>`,
  matching: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  riddles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg>`,
  wordsearch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  speedgrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/></svg>`,
  allvocabcards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>`,
  allstory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
  fallingwords: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m6 16 6 6 6-6"/><rect x="2" y="4" width="6" height="4" rx="1"/><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="16" y="5" width="6" height="4" rx="1"/></svg>`,
  wordsort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/><path d="m17 3 3 3-3 3"/><path d="m7 21-3-3 3-3"/></svg>`,
  fillblank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`,
};

// Builds a flat ordered list of all buttons
function buildAllButtons(wordsParam, allStoryParam) {
  const buttons = [];
  const hasReadaloud = config.activities.some((a) => a.id === "readaloud");

  if (!hasReadaloud) {
    buttons.push({
      id: "allvocabcards",
      label: "Cards in This Level",
      href: `/qr/assets/html/allvocab.html?words=${wordsParam}`,
    });

    buttons.push({
      id: "allstory",
      label: "All Story Words",
      href: `/qr/assets/html/allvocab.html?words=${allStoryParam}`,
    });
  }

  for (const activity of config.activities) {
    const sep = activity.href.includes("?") ? "&" : "?";
    const href = activity.useWordsParam
      ? `${activity.href}${sep}words=${wordsParam}`
      : activity.href;

    buttons.push({ id: activity.id, label: activity.label, href });

    if (activity.id === "readaloud") {
      buttons.push({
        id: "allvocabcards",
        label: "Cards in this Set",
        href: `/qr/assets/html/allvocab.html?words=${wordsParam}`,
      });

      buttons.push({
        id: "allstory",
        label: "All Story Cards",
        href: `/qr/assets/html/allvocab.html?words=${allStoryParam}`,
      });
    }

    if (activity.id === "flashcards") {
      buttons.push({
        id: "quiz",
        label: "Quiz",
        href: `/qr/assets/html/quiz.html?words=${wordsParam}`,
      });

      buttons.push({
        id: "fillblank",
        label: "Fill in the Blank",
        href: `/qr/assets/html/fillblank.html?words=${wordsParam}`,
      });
    }

    if (activity.id === "wordsearch") {
      buttons.push({
        id: "speedgrid",
        label: "Speed Grid",
        href: `/qr/assets/html/speedgrid.html?words=${wordsParam}`,
      });

      buttons.push({
        id: "fallingwords",
        label: "Falling Words",
        href: `/qr/assets/html/fallingwords.html?words=${wordsParam}`,
      });
    }
  }

  return buttons;
}

function renderButtons() {
  const activeWords = getWordsForLevel(
    config.orderedWords,
    currentLevel ?? loadSavedLevel(),
  );

  const wordsParam = buildWordsParam(activeWords);
  const allStoryParam = buildWordsParam(config.orderedWords);

  buttonContainerEl.innerHTML = "";

  const buttonMap = new Map(
    buildAllButtons(wordsParam, allStoryParam).map((b) => [b.id, b]),
  );

  for (const section of SECTIONS) {
    const sectionButtons = section.ids
      .map((id) => buttonMap.get(id))
      .filter(Boolean);

    if (sectionButtons.length === 0) continue;

    const sectionEl = document.createElement("div");
    sectionEl.className = "activity-section";

    const heading = document.createElement("h2");
    heading.className = "activity-section__heading";

    const icon = SECTION_ICONS[section.key] || "";

    heading.innerHTML = `
      <span class="section-icon">${icon}</span>
      <span class="section-label">${section.label}</span>
    `;

    sectionEl.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "activity-section__grid";

    for (const btn of sectionButtons) {
      const link = document.createElement("a");
      link.className = `button button--${btn.id}`;
      link.href = btn.href;

      const icon = ACTIVITY_ICONS[btn.id] || "";
      const helper = HELPER_TEXT[btn.id] || "";

      link.innerHTML = `
        ${icon}
        <span class="button__label">${btn.label}</span>
        ${helper ? `<span class="button__helper">${helper}</span>` : ""}
      `;

      grid.appendChild(link);
    }

    sectionEl.appendChild(grid);
    buttonContainerEl.appendChild(sectionEl);
  }
}

function init() {
  renderHeader();
  renderLevelPills();
  renderButtons();
}

init();