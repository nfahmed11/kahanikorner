const config = window.STORY_HOME_CONFIG;

if (!config) {
  throw new Error("STORY_HOME_CONFIG is missing on this page.");
}

const pageTitle = document.getElementById("page-title");
const storyTitleEl = document.getElementById("story-title");
const bookCoverEl = document.getElementById("book-cover");
const levelPickerEl = document.getElementById("level-picker");
const levelSummaryEl = document.getElementById("level-summary");
const buttonContainerEl = document.getElementById("button-container");

const storageKey = `kk-story-level-${config.slug}`;

function clampLevel(level, totalLevels) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(totalLevels, level));
}

function loadSavedLevel() {
  const raw = Number(localStorage.getItem(storageKey));
  if (!raw) return config.defaultLevel ?? 1;
  return clampLevel(raw, config.totalLevels ?? 5);
}

function saveLevel(level) {
  localStorage.setItem(storageKey, String(level));
}

function getWordsForLevel(words, level, totalLevels = 5) {
  const chunkSize = Math.ceil(words.length / totalLevels);
  return words.slice(0, chunkSize * level);
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

function renderLevelPills() {
  const totalLevels = config.totalLevels ?? 5;
  const totalWords = config.orderedWords.length;

  currentLevel = loadSavedLevel();

  if (!levelPickerEl) return;

  levelPickerEl.innerHTML = `
    <div class="level-picker-label">Word Level</div>
    <div class="level-pills" id="level-pills"></div>
    <p id="level-summary" class="level-summary"></p>`;

  const pillsContainer = document.getElementById("level-pills");

  for (let level = 1; level <= totalLevels; level++) {
    const wordsAtLevel = getWordsForLevel(config.orderedWords, level, totalLevels);
    const pill = document.createElement("button");
    pill.className = `level-pill${level === currentLevel ? " active" : ""}`;
    pill.type = "button";
    pill.innerHTML = `${level}`;
    pill.setAttribute("data-level", level);
    pill.setAttribute("aria-label", `Level ${level} — ${wordsAtLevel.length} words`);

    pill.addEventListener("click", () => {
      currentLevel = level;
      saveLevel(level);
      updatePillStates();
      updateLevelSummary(level, totalWords);
      renderButtons();
    });

    pillsContainer.appendChild(pill);
  }

  updateLevelSummary(currentLevel, totalWords);
}

function updatePillStates() {
  document.querySelectorAll(".level-pill").forEach((pill) => {
    const lvl = Number(pill.getAttribute("data-level"));
    pill.classList.toggle("active", lvl === currentLevel);
  });
}

function updateLevelSummary(level, totalWords) {
  const activeWords = getWordsForLevel(
    config.orderedWords,
    level,
    config.totalLevels ?? 5
  );

  const summaryEl = document.getElementById("level-summary");
  if (summaryEl) {
    summaryEl.textContent = `${activeWords.length} of ${totalWords} words`;
  }
}

// SVG icons for each activity (inline, white stroke)
const ACTIVITY_ICONS = {
  // Speaker — audio
  readaloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  // Book — flashcards
  flashcards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="m8 13 4-7 4 7"/><path d="M9.1 11h5.7"/></svg>`,
  // Book open check — quiz
  quiz: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V7"/><path d="m16 12 2 2 4-4"/><path d="M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3"/></svg>`,
  // Image — picture match
  matching: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  // Question mark — riddles
  riddles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  // Brain — memory game
  memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg>`,
  // Search — word search
  wordsearch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  // Rabbit — speed grid
  speedgrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/></svg>`,
  // Layers — all cards
  allcards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>`,
  // Falling arrow — falling words game
  fallingwords: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m6 16 6 6 6-6"/><rect x="2" y="4" width="6" height="4" rx="1"/><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="16" y="5" width="6" height="4" rx="1"/></svg>`,
};

function renderButtons() {
  const level = currentLevel ?? loadSavedLevel();

  const activeWords = getWordsForLevel(
    config.orderedWords,
    level,
    config.totalLevels ?? 5
  );

  const wordsParam = buildWordsParam(activeWords);

  buttonContainerEl.innerHTML = "";

  config.activities.forEach((activity) => {
    const link = document.createElement("a");
    link.className = `button button--${activity.id}`;

    const icon = ACTIVITY_ICONS[activity.id] || "";
    link.innerHTML = `${icon}<span>${activity.label}</span>`;

    if (activity.useWordsParam) {
      const separator = activity.href.includes("?") ? "&" : "?";
      link.href = `${activity.href}${separator}words=${wordsParam}`;
    } else {
      link.href = activity.href;
    }

    buttonContainerEl.appendChild(link);

    // Add All Cards button right after Read Aloud
    if (activity.id === "readaloud") {
      const acLink = document.createElement("a");
      acLink.className = "button button--allcards";
      acLink.innerHTML = `${ACTIVITY_ICONS.allcards}<span>All Cards</span>`;
      acLink.href = `/qr/assets/html/allcards.html?words=${wordsParam}`;
      buttonContainerEl.appendChild(acLink);
    }

    // Add Quiz button right after the Flashcards button
    if (activity.id === "flashcards") {
      const quizLink = document.createElement("a");
      quizLink.className = "button button--quiz";
      quizLink.innerHTML = `${ACTIVITY_ICONS.quiz}<span>Quiz</span>`;
      quizLink.href = `/qr/assets/html/quiz.html?words=${wordsParam}`;
      buttonContainerEl.appendChild(quizLink);
    }

    // Add Speed Grid button after Word Search
    if (activity.id === "wordsearch") {
      const sgLink = document.createElement("a");
      sgLink.className = "button button--speedgrid";
      sgLink.innerHTML = `${ACTIVITY_ICONS.speedgrid}<span>Speed Grid</span>`;
      sgLink.href = `/qr/assets/html/speedgrid.html?words=${wordsParam}`;
      buttonContainerEl.appendChild(sgLink);

      // Add Falling Words button after Speed Grid
      const fwLink = document.createElement("a");
      fwLink.className = "button button--fallingwords";
      fwLink.innerHTML = `${ACTIVITY_ICONS.fallingwords}<span>Falling Words</span>`;
      fwLink.href = `/qr/assets/html/fallingwords.html?words=${wordsParam}`;
      buttonContainerEl.appendChild(fwLink);
    }
  });
}

function init() {
  renderHeader();
  renderLevelPills();
  renderButtons();
}

init();