import { vocab as originalVocab } from "./mastervocab.js";

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
    console.warn("[deck] Missing from mastervocab.js:", missingWords);
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

function removeHintBlock() {
  document.querySelectorAll(".hint-wrapper").forEach((el) => el.remove());
}

// --------------------
// State
// --------------------
let currentIndex = 0;
let deck = [];
let isEnglishToUrdu = false;
let showImage = false;

// --------------------
// DOM
// --------------------
const flashcard = document.getElementById("flashcard");
const flashcardFront = document.getElementById("flashcard-front");
const flashcardBack = document.getElementById("flashcard-back");
const progressFill = document.querySelector(".progress-fill");
const progressText = document.getElementById("progress-text");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const toggleLangBtn = document.getElementById("toggle-lang");
const navButtons = document.getElementById("nav-buttons");
const toggleImageBtn = document.getElementById("toggle-image");
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
// Menu label updates
// --------------------
function updateMenuStates() {
  const langLabel = document.getElementById("toggle-lang-label");
  const imgLabel = document.getElementById("toggle-image-label");
  if (langLabel) langLabel.textContent = isEnglishToUrdu ? "Urdu → English" : "English → Urdu";
  if (imgLabel) imgLabel.textContent = showImage ? "Hide Image" : "Show Image";
  toggleImageBtn.classList.toggle("active", showImage);
}

// --------------------
// UI Events
// --------------------
toggleImageBtn.addEventListener("click", () => {
  showImage = !showImage;
  updateMenuStates();
  updateFlashcard(currentIndex);
  closeMenu();
});

toggleLangBtn.addEventListener("click", () => {
  isEnglishToUrdu = !isEnglishToUrdu;
  updateMenuStates();
  flashcard.classList.remove("flipped");
  updateFlashcard(currentIndex);
  closeMenu();
});

// --------------------
// Core render (review only)
// --------------------
function updateFlashcard(index) {
  const card = deck[index];
  const totalCards = ALLOWED_WORDS.size || deck.length;

  if (!deck.length) {
    flashcardFront.innerHTML =
      '<div class="card-inner"><div class="text-center text-gray-500">Deck is empty</div></div>';
    flashcardBack.innerHTML = "";
    return;
  }

  applyCardColor(index);
  progressFill.style.width = `${((index + 1) / totalCards) * 100}%`;
  progressText.textContent = `${index + 1}/${totalCards}`;

  if (!card || !card.word || !getEnglish(card)) {
    flashcardFront.innerHTML =
      '<div class="card-inner"><div class="text-center text-gray-500">No card data</div></div>';
    flashcardBack.innerHTML = "";
    return;
  }

  navButtons.style.display = "";
  flashcard.classList.remove("flipped");

  if (isEnglishToUrdu) {
    flashcardFront.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          ${renderHintBlock(card, { showImage })}
          <div class="text-center mt-2"><span class="lang-badge lang-badge--english">English</span></div>
          <div class="flex-grow flex justify-center items-center">
            <div class="text-4xl md:text-6xl font-bold word-english text-center break-words">${getEnglish(card)}</div>
          </div>
          <div class="card-prompt text-center mb-4">Tap card for Urdu</div>
        </div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          <div class="text-center mt-2"><span class="lang-badge lang-badge--urdu">Urdu</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div class="text-4xl md:text-6xl font-bold word-roman break-words">${displayRoman(card)}</div>
            <div><img src="${getImageSrc(card)}"
                 onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
                 alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
            <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu word-urdu break-words">${getUrdu(card)}</div>
          </div>
        </div>
      </div>`;
  } else {
    flashcardFront.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          ${renderHintBlock(card, { showImage })}
          <div class="text-center mt-2"><span class="lang-badge lang-badge--urdu">Urdu</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div class="text-4xl md:text-6xl font-bold word-roman break-words">${displayRoman(card)}</div>
            <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu word-urdu break-words">${getUrdu(card)}</div>
          </div>
          <div class="card-prompt text-center mb-4">Tap card for English</div>
        </div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          <div class="text-center mt-2"><span class="lang-badge lang-badge--english">English</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div><img src="${getImageSrc(card)}"
                 onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
                 alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
            <div class="text-6xl font-bold word-english text-center">${getEnglish(card)}</div>
          </div>
        </div>
      </div>`;
  }

  attachHintListeners();
}

// --------------------
// Listeners
// --------------------
flashcard.addEventListener("click", (e) => {
  if (e.target.closest("#hint-btn")) return;
  removeHintBlock();
  audio.cardFlip.currentTime = 0;
  audio.cardFlip.play().catch(() => {});
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
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "ArrowLeft") prevBtn.click();
});

// --------------------
// Init
// --------------------
deck = buildDeck({ shuffle: true });
updateMenuStates();
updateFlashcard(currentIndex);
