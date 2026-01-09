console.log("[flashcards] script loaded: start");

// ✅ Import (keep yours, but note: likely wrong unless bundler/importmap)
import { vocab as originalVocab } from "./vocab.js";

console.log(
  "[flashcards] after import statement (if you see this, import did not crash)"
);


// --------------------
// State
// --------------------
let currentIndex = 0;
let deck = [];
let isQuizMode = false;
let isEnglishToUrdu = false;
let correctAnswers = 0;
let showImage = true;

console.log("[flashcards] initial state", {
  currentIndex,
  isQuizMode,
  isEnglishToUrdu,
  correctAnswers,
  showImage,
});

// --------------------
// DOM Lookups
// --------------------
const flashcard = document.getElementById("flashcard");
const flashcardFront = document.getElementById("flashcard-front");
const flashcardBack = document.getElementById("flashcard-back");
const progressFill = document.querySelector(".progress-fill");
const progressText = document.getElementById("progress-text");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const quizBtn = document.getElementById("quiz-btn");
const toggleLangBtn = document.getElementById("toggle-lang");
const navButtons = document.getElementById("nav-buttons");
const toggleImageBtn = document.getElementById("toggle-image");
const shuffleButton = document.getElementById("shuffle-btn");

console.log("[flashcards] DOM refs", {
  flashcard: !!flashcard,
  flashcardFront: !!flashcardFront,
  flashcardBack: !!flashcardBack,
  progressFill: !!progressFill,
  progressText: !!progressText,
  prevBtn: !!prevBtn,
  nextBtn: !!nextBtn,
  shuffleBtn: !!shuffleBtn,
  quizBtn: !!quizBtn,
  toggleLangBtn: !!toggleLangBtn,
  navButtons: !!navButtons,
  toggleImageBtn: !!toggleImageBtn,
});

// If anything is missing, stop with a clear error
const missing = [];
if (!flashcard) missing.push("flashcard");
if (!flashcardFront) missing.push("flashcard-front");
if (!flashcardBack) missing.push("flashcard-back");
if (!progressFill) missing.push(".progress-fill");
if (!progressText) missing.push("progress-text");
if (!prevBtn) missing.push("prev-btn");
if (!nextBtn) missing.push("next-btn");
if (!shuffleBtn) missing.push("shuffle-btn");
if (!quizBtn) missing.push("quiz-btn");
if (!toggleLangBtn) missing.push("toggle-lang");
if (!navButtons) missing.push("nav-buttons");
if (!toggleImageBtn) missing.push("toggle-image");

if (missing.length) {
  console.error("[flashcards] MISSING DOM ELEMENTS:", missing);
  throw new Error(
    "Flashcards init failed: missing DOM elements: " + missing.join(", ")
  );
}

// --------------------
// Audio
// --------------------
console.log("[flashcards] initializing audio objects...");
const sparkleSound = new Audio("/qr/assets/audio/sparkle.mp3");
const correctSound = new Audio("/qr/assets/audio/success.wav");
const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");
const cardFlipSound = new Audio("/qr/assets/audio/cardflip.mp3");

// Check if audio paths resolve (won’t guarantee they exist, but helps)
console.log("[flashcards] audio paths", {
  sparkleSound: sparkleSound.src,
  correctSound: correctSound.src,
  incorrectSound: incorrectSound.src,
  cardFlipSound: cardFlipSound.src,
});

// Optional: log if audio errors
[sparkleSound, correctSound, incorrectSound, cardFlipSound].forEach((a) => {
  a.addEventListener("error", () => {
    console.warn("[flashcards] audio failed to load:", a.src);
  });
});

// --------------------
// Deck setup
// --------------------
console.log(
  "[flashcards] originalVocab loaded?",
  Array.isArray(originalVocab),
  "length:",
  originalVocab?.length
);

function resetDeck({ shuffle = false } = {}) {
  console.log("[flashcards] resetDeck called", { shuffle });

  if (!Array.isArray(originalVocab)) {
    console.error(
      "[flashcards] originalVocab is NOT an array. Import/path issue?",
      originalVocab
    );
    deck = [];
    return;
  }

  // ✅ Filter vocab down to only allowed romanUrdu words
  deck = originalVocab.filter((card) =>
    ALLOWED_WORDS.has(card.word?.romanUrdu)
  );

  if (shuffle) deck.sort(() => Math.random() - 0.5);

  console.log("[flashcards] deck rebuilt", {
    deckLength: deck.length,
    words: deck.map((c) => c.word?.romanUrdu),
    firstCard: deck[0],
  });

  // If you accidentally typo'd any allowed words, this helps catch it
  if (deck.length === 0) {
    console.warn(
      "[flashcards] deck is empty AFTER filtering. Likely romanUrdu spellings don't match ALLOWED_WORDS."
    );
  }
}

// --------------------
// UI Events
// --------------------
console.log("[flashcards] attaching event listeners...");

toggleImageBtn.addEventListener("click", () => {
  console.log("[flashcards] toggle-image clicked (before)", { showImage });
  showImage = !showImage;
  toggleImageBtn.textContent = showImage ? "Hide Image" : "Show Image";
  console.log("[flashcards] toggle-image clicked (after)", { showImage });
  updateFlashcard(currentIndex);
});

toggleLangBtn.addEventListener("click", () => {
  console.log("[flashcards] toggle-lang clicked (before)", { isEnglishToUrdu });
  isEnglishToUrdu = !isEnglishToUrdu;
  toggleLangBtn.textContent = isEnglishToUrdu
    ? "Urdu → English"
    : "English → Urdu";
  flashcard.classList.remove("flipped");
  console.log("[flashcards] toggle-lang clicked (after)", { isEnglishToUrdu });
  updateFlashcard(currentIndex);
});

// --------------------
// Effects
// --------------------
function createSparkle(x, y) {
  console.log("[flashcards] createSparkle", { x, y });
  const sparkle = document.createElement("div");
  sparkle.classList.add("sparkle");
  sparkle.style.left = `${x}px`;
  sparkle.style.top = `${y}px`;
  document.body.appendChild(sparkle);
  setTimeout(() => sparkle.remove(), 1000);
}

function triggerSparkles(centerX, centerY) {
  console.log("[flashcards] triggerSparkles", { centerX, centerY });
  sparkleSound.currentTime = 0;
  sparkleSound.play().catch((err) => {
    console.warn("[flashcards] sparkleSound.play() blocked/failed:", err);
  });

  for (let i = 0; i < 10; i++) {
    const x = centerX + (Math.random() * 60 - 30);
    const y = centerY + (Math.random() * 30 - 15);
    createSparkle(x, y);
  }
}

function launchConfetti() {
  console.log("[flashcards] launchConfetti");
  const confettiContainer = document.createElement("div");
  confettiContainer.classList.add("confetti-container");
  confettiContainer.style.position = "fixed";
  confettiContainer.style.top = "0";
  confettiContainer.style.left = "0";
  confettiContainer.style.width = "100%";
  confettiContainer.style.height = "100%";
  confettiContainer.style.pointerEvents = "none";
  confettiContainer.style.zIndex = "9999";

  for (let i = 0; i < 30; i++) {
    const confetti = document.createElement("div");
    confetti.style.position = "absolute";
    confetti.style.width = "10px";
    confetti.style.height = "10px";
    confetti.style.borderRadius = "50%";
    confetti.style.background = `hsl(${Math.random() * 360}, 100%, 70%)`;
    confetti.style.top = "0";
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.animation = `fall ${2 + Math.random() * 2}s ease-out`;
    confettiContainer.appendChild(confetti);
  }

  document.body.appendChild(confettiContainer);
  setTimeout(() => confettiContainer.remove(), 4000);
}

// --------------------
// Quiz Complete Card
// --------------------
function showQuizCompleteCard() {
  console.log("[flashcards] showQuizCompleteCard", {
    correctAnswers,
    deckLength: deck.length,
  });

  flashcardFront.innerHTML = `
    <div class="quiz-complete-card">
      <h2 class="text-3xl font-bold text-green-700 kid-title mb-4">🎉 Quiz Complete!</h2>
      <p class="text-lg text-green-800 mb-6">You got ${correctAnswers} out of ${deck.length} correct!</p>
      <div class="flex justify-center gap-4">
        <button id="try-again" class="btn bg-white border-4 border-green-400 text-green-600 px-6 py-2 rounded-full text-lg shadow-sm">Try Again</button>
        <button id="exit-quiz" class="btn bg-green-600 text-white px-6 py-2 rounded-full text-lg shadow-sm">Exit Quiz Mode</button>
      </div>
    </div>`;
  flashcardBack.innerHTML = "";

  const tryAgain = document.getElementById("try-again");
  const exitQuiz = document.getElementById("exit-quiz");

  console.log("[flashcards] quiz complete buttons exist?", {
    tryAgain: !!tryAgain,
    exitQuiz: !!exitQuiz,
  });

  tryAgain?.addEventListener("click", () => {
    console.log("[flashcards] try-again clicked");
    resetDeck({ shuffle: true });
    currentIndex = 0;
    correctAnswers = 0;
    updateFlashcard(currentIndex);
  });

  exitQuiz?.addEventListener("click", () => {
    console.log("[flashcards] exit-quiz clicked");
    isQuizMode = false;
    correctAnswers = 0;
    currentIndex = 0;

    resetDeck({ shuffle: false });

    quizBtn.textContent = "Quiz Mode";
    toggleLangBtn.style.display = "inline-block";
    toggleImageBtn.style.display = "inline-block";
    shuffleButton.style.display = "inline-block";
    navButtons.style.display = "flex";

    flashcard.classList.remove("flipped");
    updateFlashcard(currentIndex);
  });
}

// --------------------
// Hint block
// --------------------
function renderHintBlock(card, side = "front") {
  console.log("[flashcards] renderHintBlock", { side, showImage });

  if (side !== "front") return "";

  if (showImage) {
    return `
      <div class="absolute top-2 right-2 flex flex-col items-center space-y-1 scale-75 z-10">
        <img src="${card.image}" alt="Word Image" class="w-24 h-24 md:w-28 md:h-28 object-contain" />
      </div>`;
  }

  return `
    <button id="hint-btn" class="absolute top-2 right-2 scale-90 z-10 w-32 h-32 flex flex-col items-center space-y-1">
      <div class="relative w-full h-full">
        <img class="filler-image w-full h-full object-contain absolute top-0 left-0"
             src="https://cdn-icons-png.flaticon.com/512/427/427735.png" alt="Hint Icon" />
        <img class="hint-image w-full h-full object-contain absolute top-0 left-0"
             style="opacity: 0;" src="${card.image}" alt="Word Image" />
      </div>
      <span class="text-xs font-semibold text-yellow-600 bg-white border border-yellow-400 px-2 py-1 rounded-full shadow-sm">
        Hint
      </span>
    </button>`;
}

function removeHintBlock() {
  console.log("[flashcards] removeHintBlock");
  document.querySelectorAll(".top-2.right-2").forEach((el) => el.remove());
}

function attachHintListeners() {
  console.log(
    "[flashcards] attachHintListeners (hint buttons count):",
    document.querySelectorAll("#hint-btn").length
  );

  document.querySelectorAll("#hint-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      console.log("[flashcards] hint-btn clicked");
      e.stopPropagation();

      const cardSection = e.target.closest(".flashcard-front, .flashcard-back");
      if (!cardSection) {
        console.warn("[flashcards] hint clicked but couldn't find cardSection");
        return;
      }

      const hintImg = cardSection.querySelector(".hint-image");
      const fillerImg = cardSection.querySelector(".filler-image");

      if (!hintImg || !fillerImg) {
        console.warn("[flashcards] hint elements missing", {
          hintImg: !!hintImg,
          fillerImg: !!fillerImg,
        });
        return;
      }

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
// Core render
// --------------------
function updateFlashcard(index) {
  console.log("[flashcards] updateFlashcard called", {
    index,
    deckLength: deck.length,
  });

  const card = deck[index];

  if (!deck.length) {
    console.error("[flashcards] deck is empty. Check vocab import/path OR ALLOWED_WORDS spellings.");
    flashcardFront.innerHTML =
      '<div class="text-center text-white">Deck is empty</div>';
    flashcardBack.innerHTML = "";
    return;
  }

  progressFill.style.width = `${((index + 1) / deck.length) * 100}%`;
  progressText.textContent = `${index + 1}/${deck.length}`;

  if (!card || !card.word || !card.word.english) {
    console.error("[flashcards] No card data at index", { index, card });
    flashcardFront.innerHTML =
      '<div class="text-center text-white">No card data</div>';
    flashcardBack.innerHTML = "";
    return;
  }

  console.log("[flashcards] rendering card", {
    word: card.word,
    image: card.image,
  });

  const urduLabelClass = "text-fuchsia-500";
  const urduFontClass = "text-fuchsia-600";
  const englishLabelClass = "text-green";
  const englishFontClass = "text-green";
  const urduGradient = "linear-gradient(135deg, #fbc2eb, #a6c1ee)";
  const englishGradient = "linear-gradient(135deg, #90f7ec, #3296cc)";

  if (isQuizMode) {
    console.log("[flashcards] rendering QUIZ mode", { isEnglishToUrdu });

    navButtons.style.display = "none";
    flashcard.classList.remove("flipped");

    flashcardFront.style.background = isEnglishToUrdu
      ? englishGradient
      : urduGradient;
    flashcardBack.style.background = "";

    const options = [...deck]
      .filter((c) => c.word.english !== card.word.english)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .concat(card)
      .sort(() => Math.random() - 0.5);

    console.log(
      "[flashcards] quiz options",
      options.map((o) => o.word.english)
    );

    flashcardFront.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-center text-center gap-4 px-4">
        <div class="text-sm ${
          isEnglishToUrdu ? englishLabelClass : urduLabelClass
        } text-center mt-2">
          ${isEnglishToUrdu ? "English" : "Urdu"}
        </div>

        <div class="flex-grow flex flex-col justify-center items-center text-center gap-3">
          ${
            isEnglishToUrdu
              ? `<div class="text-4xl md:text-6xl font-bold ${englishFontClass} text-center break-words">${card.word.english}</div>`
              : `<div class="text-3xl md:text-5xl font-bold text-lightpurple break-words">${card.word.romanUrdu}</div>
                 <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu ${urduFontClass} break-words">${card.word.urdu}</div>`
          }
        </div>

        <div class="text-purple-600 text-center mt-3 mb-3">What does this mean?</div>

        <div class="flex flex-col items-center mb-4">
          ${options
            .map((item) => {
              const isCorrect = item.word.english === card.word.english;
              const label = isEnglishToUrdu
                ? `${item.word.urdu} (${item.word.romanUrdu})`
                : item.word.english;
              return `<button class="quiz-option btn w-3/4 max-w-xs my-1 border border-purple-300 text-purple-700 bg-white py-1 rounded-full" data-correct="${isCorrect}">${label}</button>`;
            })
            .join("")}
        </div>

        ${renderHintBlock(card)}
      </div>`;

    flashcardBack.innerHTML = "";

    console.log(
      "[flashcards] attaching quiz option listeners:",
      document.querySelectorAll(".quiz-option").length
    );

    document.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        console.log("[flashcards] quiz-option clicked", e.target.textContent);

        const isCorrect = e.target.getAttribute("data-correct") === "true";
        console.log("[flashcards] quiz-option isCorrect?", isCorrect);

        document.querySelectorAll(".quiz-option").forEach((opt) => {
          opt.disabled = true;
          opt.classList.add("opacity-50", "cursor-not-allowed");
        });

        if (isCorrect) {
          correctSound.currentTime = 0;
          correctSound.play().catch(() => {});
          launchConfetti();
          e.target.classList.add("border-green-400", "text-green-600");
          correctAnswers++;
          console.log("[flashcards] correctAnswers incremented", {
            correctAnswers,
          });
        } else {
          incorrectSound.currentTime = 0;
          incorrectSound.play().catch(() => {});
          e.target.classList.add("border-red-400", "text-red-600", "shake");
          setTimeout(() => e.target.classList.remove("shake"), 400);
        }

        setTimeout(() => {
          console.log("[flashcards] moving to next quiz card");
          if (currentIndex < deck.length - 1) {
            currentIndex++;
            updateFlashcard(currentIndex);
          } else {
            showQuizCompleteCard();
          }
        }, 1500);
      });
    });

    attachHintListeners();
    return;
  }

  console.log("[flashcards] rendering NORMAL mode", { isEnglishToUrdu });

  navButtons.style.display = "flex";
  flashcard.classList.remove("flipped");
  flashcardFront.style.background = isEnglishToUrdu
    ? englishGradient
    : urduGradient;
  flashcardBack.style.background = isEnglishToUrdu
    ? urduGradient
    : englishGradient;

  if (isEnglishToUrdu) {
    flashcardFront.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        ${renderHintBlock(card, "front")}
        <div class="text-sm ${englishLabelClass} text-center mt-2">English</div>
        <div class="flex-grow flex justify-center items-center">
          <div class="text-4xl md:text-6xl font-bold ${englishFontClass} text-center break-words">${
            card.word.english
          }</div>
        </div>
        <div class="text-sm ${englishLabelClass} text-center mb-4">Click card for Urdu</div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        <div class="text-sm ${urduLabelClass} text-center mt-2">Urdu</div>
        <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
          <div class="text-4xl md:text-6xl font-bold text-lightpurple break-words">${card.word.romanUrdu}</div>
          <div><img src="${card.image}" alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
          <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu ${urduFontClass} break-words">${card.word.urdu}</div>
        </div>
      </div>`;
  } else {
    flashcardFront.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        ${renderHintBlock(card, "front")}
        <div class="text-sm ${urduLabelClass} text-center mt-2">Urdu</div>
        <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
          <div class="text-4xl md:text-6xl font-bold text-lightpurple break-words">${
            card.word.romanUrdu
          }</div>
          <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu ${urduFontClass} break-words">${
            card.word.urdu
          }</div>
        </div>
        <div class="text-sm ${urduLabelClass} text-center mb-4">Click card for English</div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        <div class="text-sm ${englishLabelClass} text-center mt-2">English</div>
        <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
          <div><img src="${card.image}" alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
          <div class="text-6xl font-bold ${englishFontClass} text-center">${card.word.english}</div>
        </div>
      </div>`;
  }

  attachHintListeners();
}

// --------------------
// More listeners
// --------------------
flashcard.addEventListener("click", (e) => {
  console.log("[flashcards] flashcard clicked", {
    isQuizMode,
    target: e.target?.id || e.target?.className,
  });

  if (isQuizMode || e.target.closest("#hint-btn")) return;

  removeHintBlock();

  cardFlipSound.currentTime = 0;
  cardFlipSound.play().catch(() => {});

  const isNowFlipped = flashcard.classList.toggle("flipped");
  console.log("[flashcards] flip toggled", { isNowFlipped });

  if (!isNowFlipped) {
    setTimeout(() => updateFlashcard(currentIndex), 500);
  }
});

prevBtn.addEventListener("click", () => {
  console.log("[flashcards] prev clicked", { currentIndex });
  if (currentIndex > 0) {
    currentIndex--;
    updateFlashcard(currentIndex);
  }
});

nextBtn.addEventListener("click", () => {
  console.log("[flashcards] next clicked", { currentIndex });
  if (currentIndex < deck.length - 1) {
    currentIndex++;
    updateFlashcard(currentIndex);
  }
});

document.addEventListener("keydown", (e) => {
  if (isQuizMode) return;
  if (e.key === "ArrowRight") {
    console.log("[flashcards] ArrowRight");
    nextBtn.click();
  }
  if (e.key === "ArrowLeft") {
    console.log("[flashcards] ArrowLeft");
    prevBtn.click();
  }
});

shuffleBtn.addEventListener("click", () => {
  console.log("[flashcards] shuffle clicked");
  resetDeck({ shuffle: true });
  currentIndex = 0;
  updateFlashcard(currentIndex);
});

quizBtn.addEventListener("click", () => {
  console.log("[flashcards] quiz clicked (before)", { isQuizMode });

  isQuizMode = !isQuizMode;
  quizBtn.textContent = isQuizMode ? "Exit Quiz Mode" : "Quiz Mode";

  toggleLangBtn.style.display = isQuizMode ? "none" : "inline-block";
  shuffleButton.style.display = isQuizMode ? "none" : "inline-block";
  toggleImageBtn.style.display = isQuizMode ? "none" : "inline-block";

  if (isQuizMode) {
    resetDeck({ shuffle: true });
    currentIndex = 0;
    correctAnswers = 0;
    console.log("[flashcards] quiz mode ON: reset + shuffled", {
      currentIndex,
      correctAnswers,
    });
  } else {
    console.log("[flashcards] quiz mode OFF");
  }

  updateFlashcard(currentIndex);
});

// --------------------
// Init
// --------------------
console.log("[flashcards] INIT start");
try {
  resetDeck({ shuffle: false });
  console.log("[flashcards] INIT after resetDeck", { deckLength: deck.length });
  updateFlashcard(currentIndex);
  console.log("[flashcards] INIT complete");
} catch (err) {
  console.error("[flashcards] INIT failed with error:", err);
}
