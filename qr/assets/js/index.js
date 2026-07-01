const config = window.STORY_HOME_CONFIG;

if (!config) {
  throw new Error("STORY_HOME_CONFIG is missing on this page.");
}

const pageTitle = document.getElementById("page-title");
const storyTitleEl = document.getElementById("story-title");
const bookCoverEl = document.getElementById("book-cover");
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

// ── Activity helpers ──────────────────────────────────────────
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

function getStoryAudioHref() {
  return config.activities?.find((a) => a.id === "readaloud")?.href ?? null;
}

// ── Newspaper Extras section ───────────────────────────────────
function renderNewspaperExtrasSection() {
  const totalWords = config.orderedWords.length;

  const section = document.createElement("div");
  section.className = "ne-section";

  // Section header
  const sectionHeader = document.createElement("div");
  sectionHeader.className = "ne-section__header";
  sectionHeader.innerHTML = `
    <span class="ne-badge">Newspaper</span>
    <h2 class="ne-section__title">Newspaper Extras</h2>
    <p class="ne-section__sub">Everything that goes with this month's printed newspaper.</p>
  `;
  section.appendChild(sectionHeader);

  // Main 2×2 card grid: Story Audio, Answer Keys, Fill the Kahani, Full Word Bank
  const audioHref = getStoryAudioHref();
  const hasAnswerKeys = !!config.activityAnswerKeys?.length;
  const mainGrid = document.createElement("div");
  mainGrid.className = "ne-main-grid";

  if (audioHref) {
    const audioCard = document.createElement("a");
    audioCard.href = audioHref;
    audioCard.className = "ne-card ne-card--audio";
    audioCard.innerHTML = `
      <div class="ne-card__icon">${ACTIVITY_ICONS.readaloud}</div>
      <div class="ne-card__title">Story Audio</div>
      <div class="ne-card__sub">Listen to this month's story</div>
    `;
    mainGrid.appendChild(audioCard);
  }

  if (hasAnswerKeys) {
    const akCard = document.createElement("button");
    akCard.type = "button";
    akCard.className = "ne-card ne-card--keys";
    akCard.innerHTML = `
      <div class="ne-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M7 8h10M7 12h10M7 16h6"/>
        </svg>
      </div>
      <div class="ne-card__title">Activity Answer Keys</div>
      <div class="ne-card__sub">Check answers for this month's newspaper activities</div>
    `;
    akCard.addEventListener("click", openActivityAnswerKeysModal);
    mainGrid.appendChild(akCard);
  }

  // Fill the Kahani card
  const ftkQuestions = config?.fillTheKahani?.questions;
  const hasFtk = Array.isArray(ftkQuestions) && ftkQuestions.length > 0;

  const fillKahaniCard = document.createElement(hasFtk ? "a" : "div");
  fillKahaniCard.className = "ne-card ne-card--fillkahani" + (hasFtk ? "" : " ne-card--fillkahani-soon");
  fillKahaniCard.setAttribute("aria-label", "Fill the Kahani — Fill in missing words from this month's kahani");
  fillKahaniCard.innerHTML = `
    <div class="ne-card__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/>
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>
      </svg>
    </div>
    <div class="ne-card__title">Fill the Kahani</div>
    <div class="ne-card__sub">${hasFtk ? "Fill in missing words from this month's kahani" : "Coming soon"}</div>
  `;

  if (hasFtk) {
    const FTK_HREF = "/qr/assets/html/fill-the-kahani.html";
    fillKahaniCard.href = FTK_HREF;
    fillKahaniCard.addEventListener("click", function (event) {
      event.preventDefault();
      try {
        sessionStorage.setItem("KAHANI_CURRENT_ISSUE", JSON.stringify(config));
      } catch (e) {
        console.warn("[KK] Could not save issue config to sessionStorage", e);
      }
      window.location.href = FTK_HREF;
    });
  }

  mainGrid.appendChild(fillKahaniCard);

  // Full Word Bank card — reflects the currently selected level
  const bankCard = document.createElement("a");
  bankCard.id = "ne-bank-card";
  bankCard.className = "ne-card ne-card--bank";
  bankCard.innerHTML = `
    <div class="ne-card__icon">${ACTIVITY_ICONS.allvocabcards}</div>
    <div class="ne-card__title" id="ne-bank-title"></div>
    <div class="ne-card__sub" id="ne-bank-sub"></div>
  `;
  mainGrid.appendChild(bankCard);
  section.appendChild(mainGrid);

  // Word Sets module — compact chooser below the 4-card grid
  const wordSetsCard = document.createElement("div");
  wordSetsCard.className = "ne-wordsets";
  wordSetsCard.innerHTML = `
    <div class="ne-wordsets__header">
      <div class="ne-wordsets__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/>
          <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/>
          <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>
        </svg>
      </div>
      <div class="ne-wordsets__info">
        <div class="ne-wordsets__title">Choose a Word Set</div>
        <div class="ne-wordsets__sub">Practice a few story words at a time.</div>
      </div>
    </div>
    <div class="ne-pills-row" id="ne-pills-row"></div>
    <p class="ne-level-summary" id="ne-level-summary"></p>
  `;
  section.appendChild(wordSetsCard);

  // Build the level pills
  const pillsRow = wordSetsCard.querySelector("#ne-pills-row");
  for (let level = 1; level <= TOTAL_LEVELS; level++) {
    const words = getWordsForLevel(config.orderedWords, level);
    const label = level === 5 ? "All" : `${level}`;
    const ariaLabel =
      level === 5 ? `All ${totalWords} words` : `Set ${level} — ${words.length} words`;

    const pill = document.createElement("button");
    pill.className = `ne-pill${level === currentLevel ? " ne-pill--active" : ""}`;
    pill.type = "button";
    pill.textContent = label;
    pill.setAttribute("data-level", level);
    pill.setAttribute("aria-label", ariaLabel);

    pill.addEventListener("click", () => {
      currentLevel = level;
      saveLevel(level);
      wordSetsCard.querySelectorAll(".ne-pill").forEach((p) => {
        p.classList.toggle("ne-pill--active", Number(p.getAttribute("data-level")) === level);
      });
      updateNeSummary(level, totalWords);
      renderPracticeGamesSection();
      updateBankCard(level);
    });

    pillsRow.appendChild(pill);
  }

  updateNeSummary(currentLevel, totalWords);

  buttonContainerEl.appendChild(section);
  updateBankCard(currentLevel);
}

function updateNeSummary(level, totalWords) {
  const summaryEl = document.getElementById("ne-level-summary");
  if (!summaryEl) return;

  if (level === 5) {
    summaryEl.textContent = `Showing all ${totalWords} words`;
    return;
  }

  if (isLargeStory()) {
    const chunkSize = Math.ceil(totalWords / CHUNK_LEVELS);
    const start = (level - 1) * chunkSize;
    const end = Math.min(start + chunkSize, totalWords);
    summaryEl.textContent = `Set ${level} of ${CHUNK_LEVELS} · Words ${start + 1}–${end} of ${totalWords}`;
  } else {
    const count = getWordsForLevel(config.orderedWords, level).length;
    summaryEl.textContent = `${count} of ${totalWords} words`;
  }
}

function updateBankCard(level) {
  const card = document.getElementById("ne-bank-card");
  if (!card) return;

  const totalWords = config.orderedWords.length;
  const words = getWordsForLevel(config.orderedWords, level);
  card.href = `/qr/assets/html/allvocab.html?words=${buildWordsParam(words)}`;

  const titleEl = document.getElementById("ne-bank-title");
  const subEl = document.getElementById("ne-bank-sub");

  if (level === 5) {
    if (titleEl) titleEl.textContent = "Full Word Bank";
    if (subEl) subEl.textContent = `Browse all ${totalWords} words from this story`;
  } else {
    if (titleEl) titleEl.textContent = `Word Set ${level}`;
    if (subEl) subEl.textContent = `Browse ${words.length} of ${totalWords} words`;
  }
}

// ── Practice Games section ─────────────────────────────────────
function buildPracticeGameButtons() {
  const activeWords = getWordsForLevel(config.orderedWords, currentLevel ?? loadSavedLevel());
  const wordsParam = buildWordsParam(activeWords);
  const buttons = [];

  for (const activity of config.activities) {
    if (activity.id === "readaloud") continue;

    const sep = activity.href.includes("?") ? "&" : "?";
    const href = activity.useWordsParam
      ? `${activity.href}${sep}words=${wordsParam}`
      : activity.href;

    buttons.push({ id: activity.id, label: activity.label, href });

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

function renderPracticeGamesSection() {
  const existing = document.getElementById("pg-section");
  if (existing) existing.remove();

  const buttons = buildPracticeGameButtons();
  if (buttons.length === 0) return;

  const section = document.createElement("div");
  section.id = "pg-section";
  section.className = "pg-section";

  const sectionHeader = document.createElement("div");
  sectionHeader.className = "pg-section__header";
  sectionHeader.innerHTML = `
    <span class="ne-badge ne-badge--games">Practice</span>
    <h2 class="pg-section__title">Practice Games</h2>
    <p class="pg-section__sub">Play with this month's Urdu words</p>
  `;
  section.appendChild(sectionHeader);

  const grid = document.createElement("div");
  grid.className = "activity-section__grid";

  for (const btn of buttons) {
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

  section.appendChild(grid);
  buttonContainerEl.appendChild(section);
}

// ── Activity Answer Keys modal ────────────────────────────────
function openActivityAnswerKeysModal() {
  const existing = document.getElementById("ak-full-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "ak-full-overlay";
  overlay.className = "ak-full-overlay";

  const panel = document.createElement("div");
  panel.className = "ak-full-panel";

  function closePanel() {
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 300);
  }

  const header = document.createElement("div");
  header.className = "ak-full-header";

  const headerText = document.createElement("div");
  const titleEl = document.createElement("h2");
  titleEl.className = "ak-full-title";
  titleEl.textContent = "Activity Answer Keys";
  const subtitleEl = document.createElement("p");
  subtitleEl.className = "ak-full-subtitle";
  subtitleEl.textContent = "Check answers for this month's newspaper activities.";
  headerText.appendChild(titleEl);
  headerText.appendChild(subtitleEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "ak-full-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", closePanel);

  header.appendChild(headerText);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const content = document.createElement("div");
  content.className = "ak-full-content";

  const cards = config.activityAnswerKeys.map((ak) => {
    const card = renderAnswerKeyCard(ak);
    content.appendChild(card);
    return card;
  });

  // Accordion: clicking a trigger opens it and closes all others
  cards.forEach((card) => {
    const trigger = card.querySelector(".ak-accordion__trigger");
    const body = card.querySelector(".ak-accordion__body");

    trigger.addEventListener("click", () => {
      const isOpen = card.classList.contains("ak-accordion--open");

      cards.forEach((c) => {
        c.classList.remove("ak-accordion--open");
        const b = c.querySelector(".ak-accordion__body");
        if (b) b.style.maxHeight = "0";
      });

      if (!isOpen) {
        card.classList.add("ak-accordion--open");
        body.style.maxHeight = body.scrollHeight + "px";
      }
    });
  });

  panel.appendChild(content);
  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePanel();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
}

function renderAnswerKeyCard(ak) {
  const card = document.createElement("div");
  card.className = "ak-key-card ak-accordion";

  // Clickable header row (acts as the accordion trigger)
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ak-accordion__trigger";

  const triggerText = document.createElement("div");
  triggerText.className = "ak-accordion__label";

  const titleEl = document.createElement("div");
  titleEl.className = "ak-key-title";
  titleEl.textContent = ak.title;
  triggerText.appendChild(titleEl);

  if (ak.subtitle) {
    const subEl = document.createElement("div");
    subEl.className = "ak-key-subtitle";
    subEl.textContent = ak.subtitle;
    triggerText.appendChild(subEl);
  }

  const chevron = document.createElement("span");
  chevron.className = "ak-accordion__chevron";
  chevron.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>`;

  trigger.appendChild(triggerText);
  trigger.appendChild(chevron);
  card.appendChild(trigger);

  // Collapsible body (starts closed)
  const body = document.createElement("div");
  body.className = "ak-accordion__body";
  body.style.maxHeight = "0";

  if ((ak.type === "text" || ak.type === "mixed") && ak.answers?.length) {
    const list = document.createElement("ol");
    list.className = "ak-answers-list";

    ak.answers.forEach((answer, i) => {
      const item = document.createElement("li");
      item.className = "ak-answer-item";

      const numEl = document.createElement("div");
      numEl.className = "ak-answer-num";
      numEl.textContent = i + 1;
      item.appendChild(numEl);

      const answerBody = document.createElement("div");
      answerBody.className = "ak-answer-body";

      const promptEl = document.createElement("div");
      promptEl.className = "ak-answer-prompt";
      promptEl.textContent = answer.prompt;
      answerBody.appendChild(promptEl);

      if (answer.romanUrdu) {
        const romanEl = document.createElement("div");
        romanEl.className = "ak-answer-roman";
        romanEl.textContent = answer.romanUrdu;
        answerBody.appendChild(romanEl);
      }

      if (answer.urdu) {
        const urduEl = document.createElement("div");
        urduEl.className = "ak-answer-urdu";
        urduEl.setAttribute("dir", "rtl");
        urduEl.textContent = answer.urdu;
        answerBody.appendChild(urduEl);
      }

      item.appendChild(answerBody);
      list.appendChild(item);
    });

    body.appendChild(list);
  }

  if ((ak.type === "image" || ak.type === "mixed") && ak.image) {
    const imgWrapper = document.createElement("div");
    imgWrapper.className = "ak-image-wrapper";

    const img = document.createElement("img");
    img.src = ak.image;
    img.alt = ak.imageAlt || `${ak.title} answer key`;
    img.className = "ak-image";
    imgWrapper.appendChild(img);

    const openBtn = document.createElement("a");
    openBtn.className = "ak-download-btn";
    openBtn.href = ak.image;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Open full image
    `;
    imgWrapper.appendChild(openBtn);

    body.appendChild(imgWrapper);
  }

  card.appendChild(body);
  return card;
}

function init() {
  renderHeader();
  currentLevel = loadSavedLevel();
  buttonContainerEl.innerHTML = "";
  renderNewspaperExtrasSection();
  renderPracticeGamesSection();
}

init();
