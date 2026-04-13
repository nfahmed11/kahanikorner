const config = window.STORY_HOME_CONFIG;

if (!config) {
  throw new Error("STORY_HOME_CONFIG is missing on this page.");
}

const pageTitle = document.getElementById("page-title");
const storyTitleEl = document.getElementById("story-title");
const bookCoverEl = document.getElementById("book-cover");
const levelSelectEl = document.getElementById("level-select");
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

function renderLevelOptions() {
  const totalLevels = config.totalLevels ?? 5;
  const totalWords = config.orderedWords.length;

  levelSelectEl.innerHTML = "";

  for (let level = 1; level <= totalLevels; level++) {
    const wordsAtLevel = getWordsForLevel(config.orderedWords, level, totalLevels);
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Level ${level} (${wordsAtLevel.length} words)`;
    levelSelectEl.appendChild(option);
  }

  const savedLevel = loadSavedLevel();
  levelSelectEl.value = String(savedLevel);

  updateLevelSummary(savedLevel, totalWords);
}

function updateLevelSummary(level, totalWords) {
  const activeWords = getWordsForLevel(
    config.orderedWords,
    level,
    config.totalLevels ?? 5
  );

  if (levelSummaryEl) {
    levelSummaryEl.textContent = `Showing ${activeWords.length} of ${totalWords} story words. Each level keeps previous words and adds more.`;
  }
}

function renderButtons() {
  const level = clampLevel(
    Number(levelSelectEl.value),
    config.totalLevels ?? 5
  );

  const activeWords = getWordsForLevel(
    config.orderedWords,
    level,
    config.totalLevels ?? 5
  );

  const wordsParam = buildWordsParam(activeWords);

  buttonContainerEl.innerHTML = "";

  config.activities.forEach((activity) => {
    const link = document.createElement("a");
    link.className = "button";
    link.textContent = activity.label;

    if (activity.useWordsParam) {
      const separator = activity.href.includes("?") ? "&" : "?";
      link.href = `${activity.href}${separator}words=${wordsParam}`;
    } else {
      link.href = activity.href;
    }

    buttonContainerEl.appendChild(link);

    // Add Quiz button right after the Flashcards button
    if (activity.label === "Flashcards") {
      const quizLink = document.createElement("a");
      quizLink.className = "button";
      quizLink.textContent = "Quiz";
      quizLink.href = `/qr/assets/html/quiz.html?words=${wordsParam}`;
      buttonContainerEl.appendChild(quizLink);
    }
  });
}

function init() {
  renderHeader();
  renderLevelOptions();
  renderButtons();

  levelSelectEl.addEventListener("change", () => {
    const level = clampLevel(
      Number(levelSelectEl.value),
      config.totalLevels ?? 5
    );

    saveLevel(level);
    updateLevelSummary(level, config.orderedWords.length);
    renderButtons();
  });
}

init();