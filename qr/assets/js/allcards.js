import { vocab } from "./vocab.js";

const TOTAL_QUESTIONS = 10;

const homeScreen = document.getElementById("homeScreen");
const howToPlayScreen = document.getElementById("howToPlayScreen");
const gameScreen = document.getElementById("gameScreen");
const resultsScreen = document.getElementById("resultsScreen");

const startBtn = document.getElementById("startBtn");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const resultsHomeBtn = document.getElementById("resultsHomeBtn");

const difficultySelect = document.getElementById("difficultySelect");
const difficultyBadge = document.getElementById("difficultyBadge");

const progressText = document.getElementById("progressText");
const scoreText = document.getElementById("scoreText");

const urduWord = document.getElementById("urduWord");
const romanUrduWord = document.getElementById("romanUrduWord");
const englishHint = document.getElementById("englishHint");
const feedbackText = document.getElementById("feedbackText");

const showEnglishBtn = document.getElementById("showEnglishBtn");
const showRomanBtn = document.getElementById("showRomanBtn");

const choicesGrid = document.getElementById("choicesGrid");

const finalScore = document.getElementById("finalScore");
const accuracyText = document.getElementById("accuracyText");
const correctCountText = document.getElementById("correctCountText");
const missedWordsList = document.getElementById("missedWordsList");

let playableVocab = [];
let gameQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let correctCount = 0;
let totalAttempts = 0;
let currentDifficulty = "medium";
let currentQuestion = null;
let roundLocked = false;
let missedWords = [];
let englishShown = false;
let romanShown = true;

function init() {
  playableVocab = buildPlayableVocab(vocab);

  if (playableVocab.length < 2) {
    alert("Not enough valid image entries found in vocab.js.");
    return;
  }

  attachEvents();
  showScreen("home");
}

function attachEvents() {
  startBtn.addEventListener("click", startGame);
  howToPlayBtn.addEventListener("click", () => showScreen("howToPlay"));
  backHomeBtn.addEventListener("click", () => showScreen("home"));
  backToMenuBtn.addEventListener("click", () => showScreen("home"));
  playAgainBtn.addEventListener("click", startGame);
  resultsHomeBtn.addEventListener("click", () => showScreen("home"));

  showEnglishBtn.addEventListener("click", handleShowEnglish);
  showRomanBtn.addEventListener("click", handleShowRoman);
}

function showScreen(screenName) {
  homeScreen.classList.remove("active");
  howToPlayScreen.classList.remove("active");
  gameScreen.classList.remove("active");
  resultsScreen.classList.remove("active");

  if (screenName === "home") homeScreen.classList.add("active");
  if (screenName === "howToPlay") howToPlayScreen.classList.add("active");
  if (screenName === "game") gameScreen.classList.add("active");
  if (screenName === "results") resultsScreen.classList.add("active");
}

function buildPlayableVocab(vocabArray) {
  return vocabArray
    .filter((item) => {
      const imagePath = item?.image || "";
      if (!imagePath || typeof imagePath !== "string") return false;

      const lower = imagePath.toLowerCase().trim();
      return !lower.endsWith("noimage.png");
    })
    .map((item) => ({
      id: item.id,
      urdu: item.word?.baseUrdu || "",
      romanUrdu: item.word?.baseRomanUrdu || "",
      english: item.word?.english || "",
      image: item.image
    }))
    .filter((item) => item.id && item.urdu && item.romanUrdu && item.image);
}

function startGame() {
  currentDifficulty = difficultySelect.value;
  currentQuestionIndex = 0;
  score = 0;
  correctCount = 0;
  totalAttempts = 0;
  missedWords = [];
  roundLocked = false;

  gameQuestions = buildGameQuestions();
  updateTopBar();
  showScreen("game");
  loadQuestion();
}

function buildGameQuestions() {
  const shuffledPool = shuffle([...playableVocab]);
  const numberOfQuestions = Math.min(TOTAL_QUESTIONS, shuffledPool.length);
  const selectedAnswers = shuffledPool.slice(0, numberOfQuestions);

  return selectedAnswers.map((answerItem) => {
    const choiceCount = getChoiceCount(currentDifficulty);

    const distractorPool = playableVocab.filter((item) => item.id !== answerItem.id);
    const distractors = shuffle([...distractorPool]).slice(0, choiceCount - 1);

    const choices = shuffle([answerItem, ...distractors]);

    return {
      answer: answerItem,
      choices
    };
  });
}

function getChoiceCount(difficulty) {
  if (difficulty === "easy") return 2;
  if (difficulty === "medium") return 4;
  return 6;
}

function loadQuestion() {
  if (currentQuestionIndex >= gameQuestions.length) {
    showResults();
    return;
  }

  currentQuestion = gameQuestions[currentQuestionIndex];
  roundLocked = false;
  englishShown = false;
  romanShown = currentDifficulty !== "hard";

  feedbackText.textContent = "";
  feedbackText.className = "feedback-text";

  urduWord.textContent = currentQuestion.answer.urdu;
  romanUrduWord.textContent = currentQuestion.answer.romanUrdu;
  englishHint.textContent = currentQuestion.answer.english;

  englishHint.classList.add("hidden");
  difficultyBadge.textContent =
    currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);

  if (romanShown) {
    romanUrduWord.classList.remove("hidden");
    showRomanBtn.classList.add("hidden");
  } else {
    romanUrduWord.classList.add("hidden");
    showRomanBtn.classList.remove("hidden");
  }

  showEnglishBtn.disabled = false;
  showRomanBtn.disabled = false;

  renderChoices(currentQuestion.choices);
  updateTopBar();
}

function renderChoices(choices) {
  choicesGrid.innerHTML = "";
  choicesGrid.className = "choices-grid";

  const cols = getChoiceCount(currentDifficulty);
  choicesGrid.classList.add(`cols-${cols}`);

  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "choice-card";
    btn.type = "button";
    btn.dataset.id = choice.id;

    btn.innerHTML = `
      <img src="${choice.image}" alt="${choice.english || choice.romanUrdu}" />
    `;

    btn.addEventListener("click", () => handleChoice(choice, btn));
    choicesGrid.appendChild(btn);
  });
}

function handleChoice(choice, buttonEl) {
  if (roundLocked) return;

  totalAttempts++;

  const isCorrect = choice.id === currentQuestion.answer.id;

  if (isCorrect) {
    roundLocked = true;
    correctCount++;
    score += getBasePoints(currentDifficulty);

    if (englishShown) {
      score = Math.max(0, score - 2);
    }

    if (currentDifficulty === "hard" && romanShown) {
      score = Math.max(0, score - 1);
    }

    buttonEl.classList.add("correct");
    showFeedback("Shabash! That’s correct.", "correct");

    setTimeout(() => {
      currentQuestionIndex++;
      loadQuestion();
    }, 900);
  } else {
    buttonEl.classList.add("wrong");
    showFeedback("Try again.", "wrong");

    if (currentDifficulty === "medium") {
      score = Math.max(0, score - 1);
    }

    if (currentDifficulty === "hard") {
      score = Math.max(0, score - 2);
    }

    const alreadyMissed = missedWords.some((item) => item.id === currentQuestion.answer.id);
    if (!alreadyMissed) {
      missedWords.push(currentQuestion.answer);
    }

    setTimeout(() => {
      buttonEl.classList.remove("wrong");
    }, 500);
  }

  updateTopBar();
}

function getBasePoints(difficulty) {
  if (difficulty === "easy") return 10;
  if (difficulty === "medium") return 10;
  return 15;
}

function handleShowEnglish() {
  if (englishShown) return;
  englishShown = true;
  englishHint.classList.remove("hidden");
  showEnglishBtn.disabled = true;
}

function handleShowRoman() {
  if (romanShown) return;
  romanShown = true;
  romanUrduWord.classList.remove("hidden");
  showRomanBtn.disabled = true;
}

function updateTopBar() {
  progressText.textContent = `${Math.min(currentQuestionIndex + 1, gameQuestions.length)} / ${gameQuestions.length || TOTAL_QUESTIONS}`;
  scoreText.textContent = score;
}

function showFeedback(message, type) {
  feedbackText.textContent = message;
  feedbackText.className = `feedback-text ${type}`;
}

function showResults() {
  finalScore.textContent = score;
  correctCountText.textContent = `${correctCount} / ${gameQuestions.length}`;

  const accuracy =
    totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
  accuracyText.textContent = `${accuracy}%`;

  renderMissedWords();
  showScreen("results");
}

function renderMissedWords() {
  missedWordsList.innerHTML = "";

  const uniqueMissed = dedupeById(missedWords);

  if (uniqueMissed.length === 0) {
    missedWordsList.innerHTML = `<p class="empty-missed">No missed words. Shabash!</p>`;
    return;
  }

  uniqueMissed.forEach((word) => {
    const chip = document.createElement("div");
    chip.className = "missed-word-chip";
    chip.textContent = `${word.urdu} — ${word.romanUrdu}`;
    missedWordsList.appendChild(chip);
  });
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

init();