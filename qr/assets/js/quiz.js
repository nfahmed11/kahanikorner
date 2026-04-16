import { vocab as originalVocab } from "./vocab.js";

// --------------------
// Card border colors (cycles per card)
// --------------------
const CARD_COLORS = [
  "#f0c75e", "#6ab97b", "#e8836b", "#6bb5d9",
  "#b088d0", "#f0975e", "#5bbfb5", "#e87ba0",
];

// --------------------
// Audio (lazy — created once, shared)
// --------------------
const audio = {
  sparkle: new Audio("/qr/assets/audio/sparkle.mp3"),
  correct: new Audio("/qr/assets/audio/success.wav"),
  incorrect: new Audio("/qr/assets/audio/incorrect.wav"),
  cardFlip: new Audio("/qr/assets/audio/cardflip.mp3"),
};

// --------------------
// Vocab helpers
// --------------------
function getImageSrc(card) {
  return card?.image || "/qr/assets/images/noimage.png";
}

function getRomanForms(card) {
  if (!card) return [];
  const forms = [];
  if (card.word?.baseRomanUrdu) forms.push(card.word.baseRomanUrdu);
  if (Array.isArray(card.variants)) {
    card.variants.forEach((v) => {
      if (v?.romanUrdu) forms.push(v.romanUrdu);
    });
  }
  return [...new Set(forms)];
}

function getUrdu(card) {
  return card?.word?.baseUrdu || "";
}

function getEnglish(card) {
  return card?.word?.english || "";
}

function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => ALLOWED_WORDS.has(w));
  return matched || card?.word?.baseRomanUrdu || "";
}

// --------------------
// Deck builder
// --------------------
function buildDeck({ shuffle = false } = {}) {
  if (!Array.isArray(originalVocab)) {
    console.error("[deck] vocab import failed:", originalVocab);
    return [];
  }

  const vocabWords = new Set(originalVocab.flatMap((c) => getRomanForms(c)));
  const missingWords = [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w));

  const matchesAllowed = (card) =>
    getRomanForms(card).some((w) => ALLOWED_WORDS.has(w));

  const deck = originalVocab.filter(matchesAllowed);

  console.log("========== DECK DEBUG ==========");
  console.log("[deck] ALLOWED_WORDS:", ALLOWED_WORDS?.size ?? 0, [...ALLOWED_WORDS]);
  console.log("[deck] Loaded:", deck.length, deck.map((c) => displayRoman(c)));
  if (missingWords.length) {
    console.warn("[deck] Missing from vocab.js:", missingWords);
  }
  console.log("================================");

  if (shuffle) deck.sort(() => Math.random() - 0.5);
  return deck;
}

// --------------------
// Card color
// --------------------
function getCardColor(index) {
  return CARD_COLORS[index % CARD_COLORS.length];
}

// --------------------
// Effects
// --------------------
function createSparkle(x, y) {
  const sparkle = document.createElement("div");
  sparkle.classList.add("sparkle");
  sparkle.style.left = `${x}px`;
  sparkle.style.top = `${y}px`;
  document.body.appendChild(sparkle);
  setTimeout(() => sparkle.remove(), 1000);
}

function triggerSparkles(centerX, centerY) {
  audio.sparkle.currentTime = 0;
  audio.sparkle.play().catch(() => {});
  for (let i = 0; i < 10; i++) {
    createSparkle(
      centerX + (Math.random() * 60 - 30),
      centerY + (Math.random() * 30 - 15),
    );
  }
}

function launchConfetti() {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "9999",
  });
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement("div");
    Object.assign(piece.style, {
      position: "absolute",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: `hsl(${Math.random() * 360}, 100%, 70%)`,
      top: "0",
      left: `${Math.random() * 100}%`,
      animation: `fall ${2 + Math.random() * 2}s ease-out`,
    });
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 4000);
}

// --------------------
// Menu helpers
// --------------------
function setupMenu(toggleEl, dropdownEl) {
  let open = false;

  function openMenu() {
    open = true;
    dropdownEl.classList.remove("hidden");
    const backdrop = document.createElement("div");
    backdrop.classList.add("menu-backdrop");
    backdrop.addEventListener("click", closeMenu);
    document.body.appendChild(backdrop);
  }

  function closeMenu() {
    open = false;
    dropdownEl.classList.add("hidden");
    document.querySelectorAll(".menu-backdrop").forEach((el) => el.remove());
  }

  toggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    open ? closeMenu() : openMenu();
  });

  return { closeMenu };
}

// --------------------
// Hint helpers
// --------------------
function renderHintBlock(card, { showImage = false } = {}) {
  if (showImage) {
    return `
      <div class="hint-wrapper flex flex-col items-center">
        <img src="${getImageSrc(card)}"
             onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
             alt="Word Image" class="w-16 h-16 object-contain" />
      </div>`;
  }

  return `
    <button id="hint-btn" class="hint-wrapper flex flex-col items-center gap-1" style="background:none;border:none;cursor:pointer;">
      <div class="relative" style="width:72px;height:72px;">
        <img class="filler-image w-full h-full object-contain absolute top-0 left-0"
             src="https://cdn-icons-png.flaticon.com/512/427/427735.png" alt="Hint Icon" />
        <img class="hint-image w-full h-full object-contain absolute top-0 left-0"
             style="opacity: 0;" src="${getImageSrc(card)}"
             onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';" alt="Word Image" />
      </div>
      <span class="text-xs font-semibold text-yellow-600 bg-white border border-yellow-400 px-2 py-0.5 rounded-full shadow-sm">
        Hint
      </span>
    </button>`;
}

function attachHintListeners() {
  document.querySelectorAll("#hint-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = e.target.closest(".card-inner");
      if (!section) return;
      const hintImg = section.querySelector(".hint-image");
      const fillerImg = section.querySelector(".filler-image");
      if (!hintImg || !fillerImg) return;

      fillerImg.style.opacity = "0";
      hintImg.style.opacity = "1";

      const rect = hintImg.getBoundingClientRect();
      triggerSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2);

      setTimeout(() => {
        hintImg.style.opacity = "0";
        fillerImg.style.opacity = "1";
      }, 3000);
    });
  });
}

// --------------------
// State
// --------------------
let currentIndex = 0;
let deck = [];
let correctAnswers = 0;
let isEnglishToUrdu = false;

// --------------------
// DOM
// --------------------
const flashcard = document.getElementById("flashcard");
const flashcardFront = document.getElementById("flashcard-front");
const flashcardBack = document.getElementById("flashcard-back");
const progressFill = document.querySelector(".progress-fill");
const progressText = document.getElementById("progress-text");
const scoreDisplay = document.getElementById("score-display");
const toggleLangBtn = document.getElementById("toggle-lang");
const menuToggle = document.getElementById("menu-toggle");
const menuDropdown = document.getElementById("menu-dropdown");

// --------------------
// Menu
// --------------------
const { closeMenu } = setupMenu(menuToggle, menuDropdown);

// --------------------
// Card color
// --------------------
function applyCardColor(index) {
  const color = getCardColor(index);
  flashcardFront.style.setProperty("--card-color", color);
  flashcardBack.style.setProperty("--card-color", color);
}

// --------------------
// Score
// --------------------
function updateScore() {
  if (scoreDisplay) {
    scoreDisplay.textContent = `${correctAnswers}`;
  }
}

// --------------------
// Menu labels
// --------------------
function updateMenuStates() {
  const langLabel = document.getElementById("toggle-lang-label");
  if (langLabel) langLabel.textContent = isEnglishToUrdu ? "Urdu → English" : "English → Urdu";
}

// --------------------
// UI Events
// --------------------
toggleLangBtn.addEventListener("click", () => {
  isEnglishToUrdu = !isEnglishToUrdu;
  updateMenuStates();
  deck = buildDeck({ shuffle: true });
  currentIndex = 0;
  correctAnswers = 0;
  updateScore();
  updateQuizCard(currentIndex);
  closeMenu();
});

// --------------------
// Quiz Complete
// --------------------
function showQuizCompleteCard() {
  const totalCards = ALLOWED_WORDS.size || deck.length;
  const pct = Math.round((correctAnswers / totalCards) * 100);
  applyCardColor(0);

  let emoji = "🎉";
  let message = "Amazing job!";
  if (pct < 50) { emoji = "💪"; message = "Keep practicing!"; }
  else if (pct < 80) { emoji = "⭐"; message = "Great effort!"; }
  else if (pct < 100) { emoji = "🌟"; message = "Almost perfect!"; }

  flashcardFront.innerHTML = `
    <div class="card-inner">
      <div class="quiz-complete-card">
        <div class="text-5xl mb-3">${emoji}</div>
        <h2 class="text-2xl font-bold text-green-700 kid-title mb-2">${message}</h2>
        <p class="text-lg text-green-800 mb-2">${correctAnswers} / ${totalCards} correct</p>
        <p class="text-3xl font-bold kid-title text-green-600 mb-4">${pct}%</p>
        <div class="flex flex-col items-center gap-3">
          <button id="try-again" class="btn bg-white border-4 border-green-400 text-green-600 px-6 py-2 rounded-full text-lg shadow-sm w-48">Try Again</button>
          <a id="back-to-cards" href="#" class="btn bg-green-600 text-white px-6 py-2 rounded-full text-lg shadow-sm w-48 text-center no-underline">Back to Flashcards</a>
        </div>
      </div>
    </div>`;
  flashcardBack.innerHTML = "";

  const params = new URLSearchParams(location.search);
  const raw = params.get("words");
  const backLink = document.getElementById("back-to-cards");
  if (backLink && raw) {
    backLink.href = `/qr/assets/html/flashcards.html?words=${raw}`;
  }

  document.getElementById("try-again")?.addEventListener("click", () => {
    deck = buildDeck({ shuffle: true });
    currentIndex = 0;
    correctAnswers = 0;
    updateScore();
    updateQuizCard(currentIndex);
  });
}

// --------------------
// Core render
// --------------------
function updateQuizCard(index) {
  const card = deck[index];
  const totalCards = ALLOWED_WORDS.size || deck.length;

  if (!deck.length) {
    applyCardColor(0);
    flashcardFront.innerHTML = `
      <div class="card-inner">
        <div class="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
          <div class="text-4xl">📚</div>
          <h2 class="text-xl font-bold text-gray-700 kid-title">No words loaded</h2>
          <p class="text-gray-500 text-sm">Open Quiz Mode from the Flashcards page to load your words.</p>
          <a href="/qr/assets/html/flashcards.html" class="btn bg-purple-600 text-white px-6 py-2 rounded-full text-base shadow-sm no-underline">Go to Flashcards</a>
        </div>
      </div>`;
    flashcardBack.innerHTML = "";
    return;
  }

  applyCardColor(index);
  progressFill.style.width = `${((index + 1) / totalCards) * 100}%`;
  progressText.textContent = `${index + 1}/${totalCards}`;

  if (!card || !card.word || !getEnglish(card)) {
    flashcardFront.innerHTML =
      '<div class="card-inner"><div class="text-center text-gray-500 text-lg">No card data</div></div>';
    flashcardBack.innerHTML = "";
    return;
  }

  flashcard.classList.remove("flipped");

  // Build 3 answer options (1 correct + 2 wrong)
  const options = [...deck]
    .filter((c) => getEnglish(c) !== getEnglish(card))
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
    .concat(card)
    .sort(() => Math.random() - 0.5);

  flashcardFront.innerHTML = `
    <div class="card-inner">
      <div class="relative w-full h-full flex flex-col items-center justify-evenly text-center px-3">

        <!-- Language badge -->
        <div>
          <span class="lang-badge ${isEnglishToUrdu ? "lang-badge--english" : "lang-badge--urdu"}">
            ${isEnglishToUrdu ? "English" : "Urdu"}
          </span>
        </div>

        <!-- The word -->
        <div class="quiz-word flex flex-col items-center gap-2">
          ${
            isEnglishToUrdu
              ? `<div class="text-4xl md:text-5xl font-bold word-english break-words">${getEnglish(card)}</div>`
              : `<div class="text-3xl md:text-4xl font-bold word-roman break-words">${displayRoman(card)}</div>
                 <div class="text-3xl md:text-4xl font-bold noto-nastaliq-urdu word-urdu break-words">${getUrdu(card)}</div>`
          }
        </div>

        <!-- Prompt -->
        <div class="card-question">What does this mean?</div>

        <!-- Answer options -->
        <div class="flex flex-col items-center w-full gap-1">
          ${options
            .map((item) => {
              const isCorrect = getEnglish(item) === getEnglish(card);
              const label = isEnglishToUrdu
                ? `${getUrdu(item)} (${displayRoman(item)})`
                : getEnglish(item);
              return `<button class="quiz-option btn" data-correct="${isCorrect}">${label}</button>`;
            })
            .join("")}
        </div>

        ${renderHintBlock(card, { showImage: false })}
      </div>
    </div>`;

  flashcardBack.innerHTML = "";

  // Wire up answer buttons
  document.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const isCorrect = e.target.getAttribute("data-correct") === "true";

      document.querySelectorAll(".quiz-option").forEach((opt) => {
        opt.disabled = true;
        opt.classList.add("opacity-50", "cursor-not-allowed");
      });

      if (isCorrect) {
        audio.correct.currentTime = 0;
        audio.correct.play().catch(() => {});
        launchConfetti();
        e.target.classList.remove("opacity-50");
        e.target.classList.add("border-green-400", "text-green-600");
        correctAnswers++;
        updateScore();
      } else {
        audio.incorrect.currentTime = 0;
        audio.incorrect.play().catch(() => {});
        e.target.classList.remove("opacity-50");
        e.target.classList.add("border-red-400", "text-red-600", "shake");
        setTimeout(() => e.target.classList.remove("shake"), 400);
      }

      setTimeout(() => {
        if (currentIndex < deck.length - 1) {
          currentIndex++;
          updateQuizCard(currentIndex);
        } else {
          showQuizCompleteCard();
        }
      }, 1500);
    });
  });

  attachHintListeners();
}

// --------------------
// Init
// --------------------
deck = buildDeck({ shuffle: true });
updateMenuStates();
updateScore();
updateQuizCard(currentIndex);
