

import { vocab as originalVocab } from "./vocab.js";

// --------------------
// State
// --------------------
let currentIndex = 0;
let deck = [];
let isQuizMode = false;
let isEnglishToUrdu = false;
let correctAnswers = 0;
let showImage = false;

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

// Hard fail if DOM is missing (keep this—it's not "random", it prevents silent failure)
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
  console.error("[flashcards] Missing DOM elements:", missing);
  throw new Error("Flashcards init failed: missing DOM elements: " + missing.join(", "));
}

// --------------------
// Audio
// --------------------
const sparkleSound = new Audio("/qr/assets/audio/sparkle.mp3");
const correctSound = new Audio("/qr/assets/audio/success.wav");
const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");
const cardFlipSound = new Audio("/qr/assets/audio/cardflip.mp3");




function getRomanForms(card) {
  const v = card?.word?.romanUrdu;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function primaryRoman(card) {
  return getRomanForms(card)[0] || "";
}

function matchesAllowed(card) {
  const forms = getRomanForms(card);
  return forms.some((w) => ALLOWED_WORDS.has(w));
}
function displayRoman(card) {
  const forms = getRomanForms(card);

  // Prefer the alias that is actually in ALLOWED_WORDS
  const matched = forms.find((w) => ALLOWED_WORDS.has(w));
  return matched || forms[0] || "";
}



// --------------------
// Deck setup
// --------------------



function resetDeck({ shuffle = false } = {}) {
  if (!Array.isArray(originalVocab)) {
    console.error("[flashcards] vocab import failed: originalVocab is not an array", originalVocab);
    deck = [];
    return;
  }

  // Build lookup set of vocab romanUrdu words
  const vocabWords = new Set(originalVocab.flatMap((c) => getRomanForms(c)));

  

  // ✅ Only logs you asked for
  console.log("[flashcards] ALLOWED_WORDS:", [...ALLOWED_WORDS]);

  const missingWords = [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w));
  if (missingWords.length) {
    console.warn("[flashcards] Missing in vocab.js:", missingWords);
  }

  // Filter deck to allowed words
  deck = originalVocab.filter(matchesAllowed);


  if (shuffle) deck.sort(() => Math.random() - 0.5);
}

// --------------------
// UI Events
// --------------------
toggleImageBtn.addEventListener("click", () => {
  showImage = !showImage;
  toggleImageBtn.textContent = showImage ? "Hide Image" : "Show Image";
  updateFlashcard(currentIndex);
});

toggleLangBtn.addEventListener("click", () => {
  isEnglishToUrdu = !isEnglishToUrdu;
  toggleLangBtn.textContent = isEnglishToUrdu ? "Urdu → English" : "English → Urdu";
  flashcard.classList.remove("flipped");
  updateFlashcard(currentIndex);
});

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
  sparkleSound.currentTime = 0;
  sparkleSound.play().catch(() => {});

  for (let i = 0; i < 10; i++) {
    const x = centerX + (Math.random() * 60 - 30);
    const y = centerY + (Math.random() * 30 - 15);
    createSparkle(x, y);
  }
}

function launchConfetti() {
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

  tryAgain?.addEventListener("click", () => {
    resetDeck({ shuffle: true });
    currentIndex = 0;
    correctAnswers = 0;
    updateFlashcard(currentIndex);
  });

  exitQuiz?.addEventListener("click", () => {
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
  document.querySelectorAll(".top-2.right-2").forEach((el) => el.remove());
}

function attachHintListeners() {
  document.querySelectorAll("#hint-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const cardSection = e.target.closest(".flashcard-front, .flashcard-back");
      if (!cardSection) return;

      const hintImg = cardSection.querySelector(".hint-image");
      const fillerImg = cardSection.querySelector(".filler-image");
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
// Core render
// --------------------
function updateFlashcard(index) {
  const card = deck[index];

  if (!deck.length) {
    console.error("[flashcards] deck is empty");
    flashcardFront.innerHTML = '<div class="text-center text-white">Deck is empty</div>';
    flashcardBack.innerHTML = "";
    return;
  }

  progressFill.style.width = `${((index + 1) / deck.length) * 100}%`;
  progressText.textContent = `${index + 1}/${deck.length}`;

  if (!card || !card.word || !card.word.english) {
    flashcardFront.innerHTML = '<div class="text-center text-white">No card data</div>';
    flashcardBack.innerHTML = "";
    return;
  }

  const urduLabelClass = "text-fuchsia-500";
  const urduFontClass = "text-fuchsia-600";
  const englishLabelClass = "text-green";
  const englishFontClass = "text-green";
  const urduGradient = "linear-gradient(135deg, #fbc2eb, #a6c1ee)";
  const englishGradient = "linear-gradient(135deg, #90f7ec, #3296cc)";

  if (isQuizMode) {
    navButtons.style.display = "none";
    flashcard.classList.remove("flipped");

    flashcardFront.style.background = isEnglishToUrdu ? englishGradient : urduGradient;
    flashcardBack.style.background = "";

    const options = [...deck]
      .filter((c) => c.word.english !== card.word.english)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .concat(card)
      .sort(() => Math.random() - 0.5);

    flashcardFront.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-center text-center gap-4 px-4">
        <div class="text-sm ${isEnglishToUrdu ? englishLabelClass : urduLabelClass} text-center mt-2">
          ${isEnglishToUrdu ? "English" : "Urdu"}
        </div>

        <div class="flex-grow flex flex-col justify-center items-center text-center gap-3">
          ${
            isEnglishToUrdu
              ? `<div class="text-4xl md:text-6xl font-bold ${englishFontClass} text-center break-words">${card.word.english}</div>`
              : `<div class="text-3xl md:text-5xl font-bold text-lightpurple break-words">${displayRoman(card)}</div>
              <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu ${urduFontClass} break-words">${card.word.urdu}</div>`
            
           
          }
        </div>

        <div class="text-purple-600 text-center mt-3 mb-3">What does this mean?</div>

        <div class="flex flex-col items-center mb-4">
          ${options
            .map((item) => {
              const isCorrect = item.word.english === card.word.english;
              const label = isEnglishToUrdu
              ? `${item.word.urdu} (${displayRoman(item)})`
              : item.word.english;            
              return `<button class="quiz-option btn w-3/4 max-w-xs my-1 border border-purple-300 text-purple-700 bg-white py-1 rounded-full" data-correct="${isCorrect}">${label}</button>`;
            })
            .join("")}
        </div>

        ${renderHintBlock(card)}
      </div>`;

    flashcardBack.innerHTML = "";

    document.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const isCorrect = e.target.getAttribute("data-correct") === "true";

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
        } else {
          incorrectSound.currentTime = 0;
          incorrectSound.play().catch(() => {});
          e.target.classList.add("border-red-400", "text-red-600", "shake");
          setTimeout(() => e.target.classList.remove("shake"), 400);
        }

        setTimeout(() => {
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

  navButtons.style.display = "flex";
  flashcard.classList.remove("flipped");
  flashcardFront.style.background = isEnglishToUrdu ? englishGradient : urduGradient;
  flashcardBack.style.background = isEnglishToUrdu ? urduGradient : englishGradient;

  if (isEnglishToUrdu) {
    flashcardFront.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        ${renderHintBlock(card, "front")}
        <div class="text-sm ${englishLabelClass} text-center mt-2">English</div>
        <div class="flex-grow flex justify-center items-center">
          <div class="text-4xl md:text-6xl font-bold ${englishFontClass} text-center break-words">${card.word.english}</div>
        </div>
        <div class="text-sm ${englishLabelClass} text-center mb-4">Click card for Urdu</div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="relative w-full h-full flex flex-col justify-between">
        <div class="text-sm ${urduLabelClass} text-center mt-2">Urdu</div>
        <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
        <div class="text-4xl md:text-6xl font-bold text-lightpurple break-words">${displayRoman(card)}</div>

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
        <div class="text-4xl md:text-6xl font-bold text-lightpurple break-words">${displayRoman(card)}</div>

          <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu ${urduFontClass} break-words">${card.word.urdu}</div>
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
  if (isQuizMode || e.target.closest("#hint-btn")) return;

  removeHintBlock();

  cardFlipSound.currentTime = 0;
  cardFlipSound.play().catch(() => {});

  const isNowFlipped = flashcard.classList.toggle("flipped");

  if (!isNowFlipped) {
    setTimeout(() => updateFlashcard(currentIndex), 500);
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    updateFlashcard(currentIndex);
  }
});

nextBtn.addEventListener("click", () => {
  if (currentIndex < deck.length - 1) {
    currentIndex++;
    updateFlashcard(currentIndex);
  }
});

document.addEventListener("keydown", (e) => {
  if (isQuizMode) return;
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "ArrowLeft") prevBtn.click();
});

shuffleBtn.addEventListener("click", () => {
  resetDeck({ shuffle: true });
  currentIndex = 0;
  updateFlashcard(currentIndex);
});

quizBtn.addEventListener("click", () => {
  isQuizMode = !isQuizMode;
  quizBtn.textContent = isQuizMode ? "Exit Quiz Mode" : "Quiz Mode";

  toggleLangBtn.style.display = isQuizMode ? "none" : "inline-block";
  shuffleButton.style.display = isQuizMode ? "none" : "inline-block";
  toggleImageBtn.style.display = isQuizMode ? "none" : "inline-block";

  if (isQuizMode) {
    resetDeck({ shuffle: true });
    currentIndex = 0;
    correctAnswers = 0;
  } else {
    resetDeck({ shuffle: false });
    currentIndex = 0;
  }

  updateFlashcard(currentIndex);
});

// --------------------
// Init
// --------------------
resetDeck({ shuffle: false });
updateFlashcard(currentIndex);
